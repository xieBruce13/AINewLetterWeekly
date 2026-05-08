import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth"; // signIn used by demo form (dev-only)
import { SignInForm } from "./form";

export const metadata = { title: "登录 — ZenoNews" };

interface SignInPageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const { error, from } = await searchParams;
  const demoEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.DEMO_AUTH !== "false";

  // Map NextAuth's opaque error codes to actionable Chinese copy.
  const errorMsg = (() => {
    if (!error) return null;
    if (error === "CredentialsSignin")
      return "邮箱或密码不对。";
    if (error === "AccessDenied") return "拒绝访问。";
    if (error === "Verification") return "验证链接已失效或被用过了。";
    return "登录出错，请重试。";
  })();

  return (
    <div className="container-tight flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
            ZenoNews
          </span>
          <h1 className="mt-3 font-display text-display-md tracking-display text-claude-ink dark:text-white">
            欢迎回来
          </h1>
          <p className="mt-3 text-[15px] text-claude-body dark:text-white/70">
            登录后看到一份按你的角色重写的本周 AI 简报。
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-6 rounded-md bg-claude-coral/10 px-3 py-2 text-center text-[13px] text-claude-coral"
          >
            {errorMsg}
          </div>
        )}

        <div className="mt-8 space-y-6">
          <SignInForm redirectTo={from && from.startsWith("/") ? from : "/"} />

          <p className="text-center text-[13px] text-claude-muted">
            还没账号？
            <Link
              href="/signup"
              className="ml-1 text-claude-coral hover:underline"
            >
              注册
            </Link>
          </p>

          {demoEnabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[12px] text-claude-muted">
                <span className="h-px flex-1 bg-claude-hairline dark:bg-white/10" />
                <span>或者</span>
                <span className="h-px flex-1 bg-claude-hairline dark:bg-white/10" />
              </div>
              <form
                action={async (formData) => {
                  "use server";
                  await signIn("demo", {
                    email: formData.get("email") as string,
                    redirectTo: "/",
                  });
                }}
                className="space-y-2 rounded-lg bg-claude-surface-soft p-3 dark:bg-white/[0.04]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-uc text-claude-coral">
                  本地演示登录（仅 dev）
                </p>
                <div className="flex gap-2">
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue="alex@example.com"
                    className="input-claude flex-1"
                  />
                  <button type="submit" className="btn-secondary press">
                    进入
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
