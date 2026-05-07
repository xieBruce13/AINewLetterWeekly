import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { KeyRound } from "lucide-react";

export const metadata = { title: "忘记密码 — AI 周报" };

/**
 * Password recovery is bolted on top of the existing Resend magic-link
 * provider: clicking the email lands the user on `/account/security?reset=1`
 * fully signed in, where they can rotate the password without supplying the
 * old one. There is no separate password-reset token / table.
 *
 * If `AUTH_RESEND_KEY` is not configured we degrade gracefully — the page
 * explains what's needed instead of pretending to send a mail.
 */
export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/account/security");

  const hasResend = !!process.env.AUTH_RESEND_KEY;

  return (
    <div className="container-tight flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-claude-coral/10 text-claude-coral">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-display-md tracking-display text-claude-ink dark:text-white">
            忘记密码？
          </h1>
          <p className="mt-3 text-[15px] text-claude-body dark:text-white/70">
            {hasResend
              ? "输入你注册时用的邮箱，我们会发一个一次性登录链接，点开它就能直接进去改密码。"
              : "目前没有配置邮件发送服务，没法通过邮件重置。请联系管理员。"}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {hasResend ? (
            <form
              action={async (formData) => {
                "use server";
                const email = formData.get("email") as string;
                // signIn() will throw a NEXT_REDIRECT internally that lands
                // the user on the Auth.js `verifyRequest` page (we set that
                // to /signin/check-email). After they click the link we
                // want them to end up on /account/security with a marker so
                // the page knows to skip the "current password" prompt.
                await signIn("resend", {
                  email,
                  redirectTo: "/account/security?reset=1",
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
              <button type="submit" className="btn-coral press w-full">
                发送重置链接
              </button>
            </form>
          ) : (
            <div className="rounded-md bg-claude-surface-soft px-4 py-3 text-[13px] text-claude-body dark:bg-white/[0.04] dark:text-white/70">
              邮件服务暂未配置。请联系管理员协助重置。
            </div>
          )}

          <p className="text-center text-[13px] text-claude-muted">
            想起来了？
            <Link
              href="/signin"
              className="ml-1 text-claude-coral hover:underline"
            >
              直接登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
