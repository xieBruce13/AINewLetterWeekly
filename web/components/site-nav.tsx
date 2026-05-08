import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { ThemeToggle } from "./theme-toggle";
import { Newspaper } from "lucide-react";

/**
 * Claude-style top nav: a single 64px cream bar with a wordmark on the left,
 * a small set of nav links in the middle, and the auth controls on the right.
 *
 * The home page now hosts the Agent chat side-by-side with the news, so
 * we no longer need a dedicated "和 Agent 对话" CTA in the header — the
 * chat is always one click (or zero clicks, in 双栏 mode) away.
 */
export async function SiteNav() {
  const session = await auth();
  const signedIn = !!session?.user?.id;

  return (
    <header className="sticky top-0 z-30 border-b border-claude-hairline bg-claude-canvas/95 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95">
      <div className="container-page flex h-16 items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-[22px] tracking-display text-claude-ink dark:text-white"
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-claude-coral"
          />
          AI 周报
        </Link>

        <nav className="flex items-center gap-1 text-[14px]">
          <NavLink href="/" icon={<Newspaper className="h-3.5 w-3.5" />}>
            新闻
          </NavLink>
          <NavLink href="/?module=model">模型</NavLink>
          <NavLink href="/?module=product">产品</NavLink>
          <NavLink href="/?module=operation">运营</NavLink>
          {signedIn && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-claude-hairline sm:inline-block dark:bg-white/10" />
              <NavLink href="/saved">已保存</NavLink>
              <NavLink href="/profile">档案</NavLink>
              <NavLink href="/account/security">帐号</NavLink>
            </>
          )}
          <span className="mx-1 hidden h-4 w-px bg-claude-hairline sm:inline-block dark:bg-white/10" />
          <NavLink href="/about">如何运作</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="btn-ghost press">
                退出
              </button>
            </form>
          ) : (
            <>
              <Link
                href="/signin"
                className="btn-ghost press hidden sm:inline-flex"
              >
                登录
              </Link>
              <Link href="/signup" className="btn-coral-sm press">
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-claude-body transition-colors hover:bg-claude-surface-card hover:text-claude-ink dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white"
    >
      {icon}
      {children}
    </Link>
  );
}
