import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSavedItems } from "@/lib/db/queries";
import { Bookmark } from "lucide-react";
import { formatIssueDate, relativeTime } from "@/lib/utils";
import { moduleLabel } from "@/lib/modules";

export const metadata = { title: "已保存 — ZenoNews" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const rows = await getSavedItems(session.user.id);

  return (
    <div className="container-tight py-12">
      <header className="mb-8 flex items-center gap-3">
        <Bookmark className="h-5 w-5 text-claude-coral" />
        <h1 className="font-display text-display-md tracking-display text-claude-ink dark:text-white">
          已保存
        </h1>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-white p-12 text-center text-claude-muted shadow-hairline dark:bg-white/[0.04]">
          还没有保存任何内容。在卡片上点收藏图标，就会出现在这里。
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg bg-white shadow-hairline dark:bg-white/[0.04]">
          {rows.map(({ item, state }, i) => (
            <li
              key={item.id}
              className={
                i === 0
                  ? "p-6"
                  : "border-t border-claude-hairline p-6 dark:border-white/10"
              }
            >
              <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-uc text-claude-coral">
                <span>{moduleLabel(item.module)}</span>
                <span className="text-claude-muted-soft" aria-hidden>·</span>
                <span className="normal-case tracking-normal text-claude-muted">
                  {item.company}
                </span>
                <span className="text-claude-muted-soft" aria-hidden>·</span>
                <span className="normal-case tracking-normal text-claude-muted">
                  {formatIssueDate(item.issueDate)}
                </span>
                <span className="ml-auto text-[11px] normal-case tracking-normal text-claude-muted-soft">
                  {relativeTime(state?.updatedAt ?? new Date())}保存
                </span>
              </div>
              <Link
                href={`/items/${item.slug}`}
                className="mt-2 block font-display text-[22px] leading-[1.3] tracking-display text-claude-ink hover:text-claude-coral dark:text-white"
              >
                {state?.personalizedBlurb ?? item.headline}
              </Link>
              <p className="mt-2 line-clamp-2 text-[14px] text-claude-body dark:text-white/70">
                {item.oneLineJudgment}
              </p>
              {item.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
