import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { ShieldCheck } from "lucide-react";
import { SecurityForm } from "./form";

export const metadata = { title: "帐号安全 — AI 周报" };

interface PageProps {
  // The `?reset=1` marker comes from the magic-link flow in /forgot. We
  // don't blindly trust it — the real check is "did the current session
  // come from the Resend provider?" — but it doubles as a hint to render
  // the page as a *reset* (no current-password field, different copy)
  // even when the cookie reads the same as a normal login.
  searchParams: Promise<{ reset?: string }>;
}

export default async function SecurityPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?from=/account/security");
  }

  const { reset } = await searchParams;
  const cameFromReset = reset === "1";

  // Look up whether the user already has a password on file. First-time
  // password setters (e.g. demo / magic-link only users) shouldn't see a
  // "current password" prompt either.
  const userRow = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
    columns: { passwordHash: true, email: true },
  });
  const hasPassword = !!userRow?.passwordHash;

  // A current-password field is required only when:
  //   - The user already has a password on file, AND
  //   - The current session came from the password provider (NOT a
  //     magic-link reset, NOT a first-time set).
  // The DB-side check in `updatePassword()` is the source of truth; this
  // is just a UX hint so the form doesn't render an unfillable field.
  const signedInViaResend = session.user.signInProvider === "resend";
  const skipCurrentPassword =
    !hasPassword || signedInViaResend || cameFromReset;

  return (
    <div className="container-tight py-12 md:py-16">
      <div className="mx-auto max-w-md">
        <div>
          <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
            帐号设置
          </span>
          <h1 className="mt-2 font-display text-display-md tracking-display text-claude-ink dark:text-white">
            {cameFromReset || !hasPassword ? "设置一个新密码" : "修改密码"}
          </h1>
          <p className="mt-3 text-[15px] text-claude-body dark:text-white/70">
            {cameFromReset
              ? `已通过邮件链接确认了你的身份（${userRow?.email}），直接设新密码即可。`
              : !hasPassword
                ? "你还没有密码登录方式，设一个之后可以用 邮箱 + 密码 直接登录。"
                : "需要先输入当前密码，再设两次新密码。"}
          </p>
        </div>

        <div className="mt-8">
          <SecurityForm skipCurrentPassword={skipCurrentPassword} />
        </div>

        <div className="mt-10 flex items-start gap-2 rounded-lg border border-claude-hairline bg-claude-surface-soft px-4 py-3 text-[12px] text-claude-muted dark:border-white/10 dark:bg-white/[0.04]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            密码用 bcrypt 加盐存储，数据库里看到的只有哈希。我们不会记录明文密码，也不会用密码做其他验证之外的用途。
          </p>
        </div>

        <div className="mt-6 text-center text-[13px]">
          <Link href="/" className="text-claude-muted hover:underline">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
