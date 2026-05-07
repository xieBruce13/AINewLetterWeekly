import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, sqlClient } from "./db/client";
import { randomUUID } from "node:crypto";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "./db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /**
       * The provider id used for the *most recent* sign-in event on this
       * session (e.g. "password", "resend", "demo"). The /account/security
       * page uses this to decide whether to require the user's current
       * password before letting them set a new one — magic-link sign-ins
       * are trusted as proof-of-email-ownership and can skip the check.
       *
       * NOTE: This is only set for the sign-in itself; on subsequent JWT
       * refreshes the value persists from when the token was first minted.
       */
      signInProvider?: string;
    } & DefaultSession["user"];
  }
}

const PasswordCreds = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const providers = [];

/**
 * Primary China-friendly sign-in path: email + bcrypt password.
 *
 * Why a custom Credentials provider (vs the built-in Resend magic-link as
 * the only option):
 *   - Some users sit behind the Great Firewall and can't reliably receive
 *     transactional email (esp. from non-mainland senders).
 *   - Google / GitHub OAuth flows are unreachable from mainland China
 *     without a VPN — adding them as the *only* paths excludes a real
 *     chunk of the audience.
 *   - Password sign-in works offline-first, no third-party dependency.
 *
 * Sign-up writes the row + bcrypt hash directly via `signUpWithPassword`
 * below; this provider is sign-in only.
 */
providers.push(
  Credentials({
    id: "password",
    name: "Email + 密码",
    credentials: {
      email: { label: "邮箱", type: "email" },
      password: { label: "密码", type: "password" },
    },
    async authorize(creds) {
      const parsed = PasswordCreds.safeParse(creds);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const existing = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email),
      });
      if (!existing) return null;
      if (!existing.passwordHash) {
        // Account exists but never set a password (e.g. magic-link or
        // demo-created). Refuse — they need to use their original path
        // or set a password via /account (TODO).
        return null;
      }
      const ok = await bcrypt.compare(password, existing.passwordHash);
      if (!ok) return null;

      return {
        id: existing.id,
        email: existing.email,
        name: existing.displayName ?? existing.name ?? undefined,
      };
    },
  })
);

// Optional fallback: magic-link via Resend, only when AUTH_RESEND_KEY is set.
// Keeps a path open for users who forget their password (no /forgot flow yet).
if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@example.com",
    })
  );
}

// Local-development convenience: a passwordless "demo sign-in" that creates
// (or reuses) a user from a single email field. NEVER enable in production.
const DEMO_AUTH_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.DEMO_AUTH !== "false";

if (DEMO_AUTH_ENABLED) {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo (dev only)",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = (creds?.email as string)?.trim().toLowerCase();
        if (!email) return null;
        const existing = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, email),
        });
        if (existing) {
          return {
            id: existing.id,
            email: existing.email,
            name: existing.name ?? undefined,
          };
        }
        const id = randomUUID();
        await sqlClient`
          INSERT INTO users (id, email, name, created_at)
          VALUES (${id}, ${email}, ${email.split("@")[0]}, now())
        `;
        return { id, email, name: email.split("@")[0] };
      },
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT sessions so the Credentials providers work alongside adapter-backed
  // ones (Resend). Required by NextAuth.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    newUser: "/onboarding",
  },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.id = user.id;
      // `account` is only populated on the sign-in event itself, never on
      // subsequent JWT refreshes — capture the provider then so the rest of
      // the session knows how the user authenticated.
      if (account?.provider) token.signInProvider = account.provider;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      if (session.user && typeof token.signInProvider === "string") {
        session.user.signInProvider = token.signInProvider;
      }
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Server actions for sign-up / password change
// ---------------------------------------------------------------------------

export type SignUpResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; field?: "email" | "password" | "displayName" };

const SignUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不对"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(200, "密码太长（最多 200 位）"),
  displayName: z
    .string()
    .trim()
    .min(1, "请输入显示名")
    .max(60, "显示名最多 60 字"),
});

/**
 * Create a new user with an email + bcrypt password. Returns a structured
 * result so the calling server action can surface field-level errors to the
 * form without throwing. Does NOT sign the user in — the caller should do
 * that with `signIn("password", ...)` after redirecting from /signup.
 */
export async function signUpWithPassword(
  raw: unknown
): Promise<SignUpResult> {
  const parsed = SignUpSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] as "email" | "password" | "displayName";
    return { ok: false, error: issue.message, field };
  }
  const { email, password, displayName } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existing) {
    return {
      ok: false,
      error: "这个邮箱已经注册过了。直接登录吧？",
      field: "email",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await sqlClient`
    INSERT INTO users (id, email, name, display_name, password_hash, created_at)
    VALUES (${id}, ${email}, ${displayName}, ${displayName}, ${passwordHash}, now())
  `;
  return { ok: true, userId: id, email };
}

// ---------------------------------------------------------------------------
// Password change / reset
// ---------------------------------------------------------------------------

export type UpdatePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?: "currentPassword" | "newPassword" | "confirmPassword";
    };

const NewPasswordSchema = z
  .string()
  .min(8, "新密码至少 8 位")
  .max(200, "密码太长（最多 200 位）");

interface UpdatePasswordInput {
  userId: string;
  /**
   * Whether the caller has already proven identity by some channel other
   * than the existing password — in practice, by clicking a Resend
   * magic-link. When true we skip the current-password check; when false
   * we require it (so a stolen session cookie can't silently rotate the
   * password).
   */
  trustedReset: boolean;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export async function updatePassword(
  input: UpdatePasswordInput
): Promise<UpdatePasswordResult> {
  const parsedNew = NewPasswordSchema.safeParse(input.newPassword);
  if (!parsedNew.success) {
    return {
      ok: false,
      error: parsedNew.error.issues[0].message,
      field: "newPassword",
    };
  }
  if (input.newPassword !== input.confirmPassword) {
    return {
      ok: false,
      error: "两次输入的新密码不一致",
      field: "confirmPassword",
    };
  }

  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, input.userId),
  });
  if (!existing) {
    return { ok: false, error: "用户不存在，请重新登录。" };
  }

  // If the user already has a password_hash AND we don't trust the session
  // (i.e. they're in via the password provider), require the current
  // password to be supplied and correct.
  if (existing.passwordHash && !input.trustedReset) {
    if (!input.currentPassword) {
      return {
        ok: false,
        error: "请输入当前密码",
        field: "currentPassword",
      };
    }
    const ok = await bcrypt.compare(
      input.currentPassword,
      existing.passwordHash
    );
    if (!ok) {
      return {
        ok: false,
        error: "当前密码不对",
        field: "currentPassword",
      };
    }
    if (input.currentPassword === input.newPassword) {
      return {
        ok: false,
        error: "新密码不能和当前密码一样",
        field: "newPassword",
      };
    }
  }

  const newHash = await bcrypt.hash(input.newPassword, 10);
  await sqlClient`
    UPDATE users
       SET password_hash = ${newHash}
     WHERE id = ${input.userId}
  `;
  return { ok: true };
}
