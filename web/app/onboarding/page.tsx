import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getProfile } from "@/lib/db/queries";
import { saveProfile, skipProfile } from "./actions";

export const metadata = { title: "聊聊你 — AI 周报" };

const ROLE_SUGGESTIONS = [
  "产品经理",
  "设计师",
  "软件工程师",
  "创业者",
  "AI 研究员",
  "市场 / 增长",
  "数据分析师",
  "投资人",
];

const TOPIC_SUGGESTIONS = [
  "coding",
  "agent",
  "long-context",
  "image-gen",
  "video-gen",
  "voice",
  "design",
  "creative-tool",
  "workflow",
  "multimodal",
  "open-weight",
  "pricing",
  "browser-agent",
  "knowledge",
  "startup",
];

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const profile = await getProfile(session.user.id);

  const isReturning = !!profile?.onboardedAt;

  return (
    <div className="container-reading py-12 sm:py-16">
      {/* Progress strip — three named steps so a brand-new user understands
          where they are. The "skip for now" hatch always lives on step 2. */}
      <ol
        aria-label="入门进度"
        className="mb-10 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-uc text-claude-muted-soft"
      >
        <li className="text-claude-muted">1 注册</li>
        <li aria-hidden>·</li>
        <li className="text-claude-coral">2 告诉我们你的角色</li>
        <li aria-hidden>·</li>
        <li>3 看你的简报</li>
      </ol>

      <header className="mb-10">
        <span className="text-[12px] font-semibold uppercase tracking-uc text-claude-coral">
          为你而写
        </span>
        <h1 className="mt-3 font-display text-display-md tracking-display text-claude-ink dark:text-white">
          {isReturning ? "更新一下你的档案" : "告诉我们一点你的情况"}
        </h1>
        <p className="mt-3 text-[16px] leading-[1.6] text-claude-body dark:text-white/70">
          同样的新闻，但会按你的角色和当前在做的事重写。我们用这些信息挑选条目、改写标题、决定哪些可以直接跳过。随时都可以修改。
        </p>
        <p className="mt-1 text-[13px] text-claude-muted-soft">
          所有字段都可以留空 ——
          {isReturning ? (
            <>
              &nbsp;
              <Link href="/" className="text-claude-coral hover:underline">
                直接回简报
              </Link>
              &nbsp;也行。
            </>
          ) : (
            <>
              &nbsp;按下「先跳过」会拿到一份对所有人都一样的默认简报，之后随时回来填。
            </>
          )}
        </p>
      </header>

      <form action={saveProfile} className="space-y-7">
        <Field
          id="role"
          label="你的角色是？"
          help="自由文本最好用。例如：「金融科技公司高级 PM」、「设计师 / DesignOps」、「独立开发者，做创作者工具」。"
          defaultValue={profile?.role ?? ""}
          placeholder="高级 PM，正在加入 AI 功能"
          suggestions={ROLE_SUGGESTIONS}
        />

        <Field
          id="company"
          label="公司 / 团队"
          help="便于我们识别你的直接竞品并主动指出。"
          defaultValue={profile?.company ?? ""}
          placeholder="Acme Co."
        />

        <div className="space-y-2">
          <label
            htmlFor="current_projects"
            className="block text-[13px] font-medium text-claude-ink dark:text-white"
          >
            最近在做什么？
          </label>
          <textarea
            id="current_projects"
            name="current_projects"
            defaultValue={profile?.currentProjects ?? ""}
            placeholder="一个面向创作者的工具，带 AI 风格 profile。当前重点是 chat agent 的 UX 与 pgvector 记忆层。"
            rows={3}
            className="input-claude !h-auto py-3 leading-[1.55]"
          />
          <p className="text-[12px] text-claude-muted">
            Agent 用这段话回答「这条新闻和我有什么关系」。具体一点，1–3 句即可。
          </p>
        </div>

        <ChipsField
          id="focus_topics"
          label="想多看的话题"
          help="可以从下方 chip 里选，也可以自己输入（用逗号分隔）。"
          defaultValue={profile?.focusTopics?.join(", ") ?? ""}
          suggestions={TOPIC_SUGGESTIONS}
        />

        <ChipsField
          id="dislikes"
          label="不太想看的话题"
          help="带这些 tag 的新闻会被降权或隐藏。"
          defaultValue={profile?.dislikes?.join(", ") ?? ""}
          suggestions={["funding", "executive-quotes", "biotech", "finance"]}
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-claude-hairline pt-6 dark:border-white/10">
          <p className="text-[12px] text-claude-muted">
            保存后会立刻为你重排本期内容。
          </p>
          <div className="flex items-center gap-2">
            {!isReturning && (
              <button
                type="submit"
                formAction={skipProfile}
                className="btn-ghost press"
              >
                先跳过
              </button>
            )}
            <button type="submit" className="btn-coral press">
              {isReturning ? "保存修改" : "保存并看我的简报"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  defaultValue,
  placeholder,
  suggestions,
}: {
  id: string;
  label: string;
  help?: string;
  defaultValue: string;
  placeholder?: string;
  suggestions?: string[];
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-claude-ink dark:text-white"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        defaultValue={defaultValue}
        placeholder={placeholder}
        list={suggestions ? `${id}-list` : undefined}
        className="input-claude"
      />
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {help && <p className="text-[12px] text-claude-muted">{help}</p>}
    </div>
  );
}

function ChipsField({
  id,
  label,
  help,
  defaultValue,
  suggestions,
}: {
  id: string;
  label: string;
  help?: string;
  defaultValue: string;
  suggestions: string[];
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-claude-ink dark:text-white"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        defaultValue={defaultValue}
        placeholder="coding, agent, design"
        className="input-claude"
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      {help && <p className="text-[12px] text-claude-muted">{help}</p>}
    </div>
  );
}
