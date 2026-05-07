"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Email + password sign-in form. Uses the client `signIn()` helper so we
 * can keep the user on the page when credentials are wrong (the page-level
 * `error` query param surfaces a friendly message).
 */
export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") ?? "");
        const password = String(fd.get("password") ?? "");
        start(async () => {
          const res = await signIn("password", {
            email,
            password,
            redirect: false,
          });
          if (!res || res.error) {
            setError("邮箱或密码不对。");
            return;
          }
          router.push(redirectTo);
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="input-claude"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="password"
            className="block text-[13px] font-medium text-claude-ink dark:text-white"
          >
            密码
          </label>
          <Link
            href="/forgot"
            className="text-[12px] text-claude-muted hover:text-claude-coral hover:underline"
          >
            忘记密码？
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="至少 8 位"
          className="input-claude"
        />
      </div>

      {error && (
        <p className="text-[12px] text-claude-coral" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-coral press w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            登录中…
          </span>
        ) : (
          "登录"
        )}
      </button>
    </form>
  );
}
