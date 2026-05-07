import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { ThemeToggle } from "./theme-toggle";
import { MessageSquare, Newspaper } from "lucide-react";

/**
 * Claude-style top nav: a single 64px cream bar with a wordmark on the left,
 * a small set of nav links in the middle (the leftmost is "新闻" — the brand
 * entry to the main news page), and a coral primary CTA on the right.
 *
 * No second row, no frosted blur, no decorative chrome — Claude's nav is
 * deliberately quiet so editorial content can lead.
 */
export async function SiteNav() {
  const session = await auth();
  const signedIn = !!session?.user?.id;

  return (
    <header className="sticky top-0 z-30 border-b border-claude-hairline bg-claude-canvas/95 backdrop-blur dark:border-white/10 dark:bg-claude-dark/95">
      <div className="container-page flex h-16 items-center gap-6">
        {/* Wordmark */}
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

        {/* Primary nav — leftmost item is the "News" entry */}
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

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <>
              <Link
                href="/chat"
                className="btn-coral-sm press hidden sm:inline-flex"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                和 Agent 对话
              </Link>
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
            </>
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
