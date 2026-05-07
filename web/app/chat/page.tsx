import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getItemById } from "@/lib/db/queries";
import { ChatInterface } from "@/components/chat-interface";

export const metadata = { title: "对话 — AI 周报" };
export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/chat");
  const params = await searchParams;
  const itemId = params.item ? Number(params.item) : null;
  const pinned = itemId ? await getItemById(itemId) : null;

  const initialPrompt = pinned
    ? `结合我的角色和当前在做的项目，告诉我从 ${pinned.name}（${pinned.company}）这条新闻里我应该带走什么。`
    : undefined;

  return (
    <ChatInterface
      pinned={
        pinned
          ? {
              id: pinned.id,
              slug: pinned.slug,
              name: pinned.name,
              company: pinned.company,
            }
          : null
      }
      initialPrompt={initialPrompt}
    />
  );
}
