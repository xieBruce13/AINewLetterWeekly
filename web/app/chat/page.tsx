import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getItemById } from "@/lib/db/queries";
import { AgentChatPanel } from "@/components/agent-chat-panel";

export const metadata = { title: "对话 — AI 周报" };
export const dynamic = "force-dynamic";

/**
 * Standalone chat route. Used as a deep-link target when an external link
 * wants to open the Agent pinned to a specific item (e.g. notification
 * emails). For the un-pinned case the home page now exposes the Agent
 * directly via the side-by-side toggle, so we just redirect to "/?view=chat".
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/chat");

  const params = await searchParams;
  const itemId = params.item ? Number(params.item) : null;
  if (!itemId || Number.isNaN(itemId)) redirect("/");

  const pinned = await getItemById(itemId);
  if (!pinned) redirect("/");

  return (
    <div className="mx-auto h-[calc(100vh-4rem)] w-full max-w-5xl">
      <AgentChatPanel
        pinnedItem={{
          id: pinned.id,
          slug: pinned.slug,
          name: pinned.name,
          company: pinned.company,
        }}
        initialPrompt={`结合我的角色和当前在做的项目，告诉我从 ${pinned.name}（${pinned.company}）这条新闻里我应该带走什么。`}
        suggestions={[
          `${pinned.company} 的这个更新对我有什么实际影响？`,
          `${pinned.name} 和同类方案相比怎么样？`,
          `基于这条新闻，我接下来应该做什么？`,
        ]}
      />
    </div>
  );
}
