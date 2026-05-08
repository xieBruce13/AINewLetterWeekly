import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignUpForm } from "./form";

export const metadata = { title: "注册 — ZenoNews" };

export default async function SignUpPage() {
  // Already signed in? Skip straight to the home feed (or onboarding if
  // their profile is empty — handled by the home page itself).
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }

  return (
    <div className="container-tight flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
            ZenoNews
          </span>
          <h1 className="mt-3 font-display text-display-md tracking-display text-claude-ink dark:text-white">
            创建账号
          </h1>
          <p className="mt-3 text-[15px] text-claude-body dark:text-white/70">
            用邮箱和密码注册。下一步告诉我们你的角色，我们就按你重排本周
            AI 简报。
          </p>
        </div>

        <div className="mt-10">
          <SignUpForm />
        </div>

        <p className="mt-6 text-center text-[13px] text-claude-muted">
          已经有账号？
          <Link
            href="/signin"
            className="ml-1 text-claude-coral hover:underline"
          >
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
