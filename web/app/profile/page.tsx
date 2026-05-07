import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { memoryFacts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getProfile } from "@/lib/db/queries";
import { deleteProfile } from "@/app/onboarding/actions";

export const metadata = { title: "档案 — AI 周报" };
export const dynamic = "force-dynamic";

const FACT_SOURCE_LABEL: Record<string, string> = {
  "explicit-onboarding": "入门时填写",
  "chat-extraction": "对话中提取",
  "explicit-remember": "对话中明确请求",
};

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const profile = await getProfile(session.user.id);
  const facts = await db
    .select()
    .from(memoryFacts)
    .where(eq(memoryFacts.userId, session.user.id))
    .orderBy(desc(memoryFacts.createdAt))
    .limit(40);

  return (
    <div className="container-reading py-12">
      <header className="mb-8">
        <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
          关于你
        </span>
        <h1 className="mt-3 font-display text-display-md tracking-display text-claude-ink dark:text-white">
          我的档案
        </h1>
        <p className="mt-3 text-[15px] text-claude-body dark:text-white/70">
          Agent 关于你的全部信息都在这里。可编辑、可删除，全部用于个性化你的 feed 与对话。
        </p>
      </header>

      <div className="rounded-lg bg-white p-6 shadow-hairline dark:bg-white/[0.04]">
        <dl className="space-y-5 text-[14px]">
          <Row label="角色" value={profile?.role} />
          <Row label="公司 / 团队" value={profile?.company} />
          <Row label="正在做的事" value={profile?.currentProjects} />
          <Row label="想多看的话题">
            {profile?.focusTopics?.length ? (
              <Chips items={profile.focusTopics} variant="coral" />
            ) : (
              <Empty />
            )}
          </Row>
          <Row label="不感兴趣">
            {profile?.dislikes?.length ? (
              <Chips items={profile.dislikes} />
            ) : (
              <Empty />
            )}
          </Row>
          <Row label="自动隐藏的公司">
            {profile?.dismissedCompanies?.length ? (
              <Chips items={profile.dismissedCompanies} />
            ) : (
              <Empty />
            )}
          </Row>
        </dl>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-claude-hairline pt-4 dark:border-white/10">
          <Link href="/onboarding" className="btn-secondary press">
            编辑档案
          </Link>
          <form action={deleteProfile}>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md px-4 text-[14px] font-medium text-claude-coral hover:bg-claude-coral/10 press"
            >
              删除档案与记忆
            </button>
          </form>
        </div>
      </div>

      <h2 className="mt-12 font-display text-[26px] tracking-display text-claude-ink dark:text-white">
        Agent 记得的事
      </h2>
      <p className="mt-2 text-[14px] text-claude-muted">
        从你的入门信息和对话中存下的事实。它们会影响你看到的每一条回复。
      </p>
      <ul className="mt-4 space-y-2">
        {facts.length === 0 ? (
          <li className="rounded-lg bg-claude-surface-soft p-6 text-center text-[14px] text-claude-muted dark:bg-white/[0.04]">
            还没有记忆。和 Agent 聊一聊，它会把重要的事记下来。
          </li>
        ) : (
          facts.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-3 rounded-lg bg-white p-3 text-[14px] shadow-hairline dark:bg-white/[0.04]"
            >
              <span className="chip mt-0.5 shrink-0 text-[10px]">
                {FACT_SOURCE_LABEL[f.source] ?? f.source}
              </span>
              <span className="text-claude-body dark:text-white/85">{f.fact}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-4">
      <dt className="text-claude-muted">{label}</dt>
      <dd className="col-span-2 text-claude-body dark:text-white/90">
        {children ?? value ?? <Empty />}
      </dd>
    </div>
  );
}

function Empty() {
  return <span className="text-claude-muted-soft">—</span>;
}

function Chips({
  items,
  variant = "neutral",
}: {
  items: string[];
  variant?: "neutral" | "coral";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) =>
        variant === "coral" ? (
          <span
            key={t}
            className="rounded-pill bg-claude-coral/10 px-2.5 py-0.5 text-[12px] font-medium text-claude-coral"
          >
            {t}
          </span>
        ) : (
          <span key={t} className="chip">
            {t}
          </span>
        )
      )}
    </div>
  );
}
