import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, type CoreMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { buildAgentTools } from "@/lib/agent/tools";
import { extractFactsFromTurns, retrieveRelevantFacts } from "@/lib/agent/memory";
import { randomUUID } from "node:crypto";

export const maxDuration = 60;

const CHAT_MODEL = "gpt-4o-mini";

interface ChatRequestBody {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  sessionId?: string;
  referencedItemIds?: number[];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const userId = session.user.id;

  // Resolve / create the chat session row.
  let sessionId = body.sessionId;
  try {
    if (!sessionId) {
      sessionId = randomUUID();
      await db.insert(chatSessions).values({
        id: sessionId,
        userId,
        title: body.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? null,
      });
    } else {
      const owned = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1);
      if (!owned[0]) {
        sessionId = randomUUID();
        await db.insert(chatSessions).values({
          id: sessionId,
          userId,
          title: body.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? null,
        });
      }
    }
  } catch {
    // DB issue creating session — continue with a temp ID so chat still works.
    sessionId = randomUUID();
  }

  const lastUserMessage = [...body.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage) {
    return NextResponse.json({ error: "no user message" }, { status: 400 });
  }

  // Persist user turn — best-effort, never block the response.
  db.insert(chatMessages)
    .values({
      sessionId,
      role: "user",
      content: { text: lastUserMessage.content },
      referencedItemIds: body.referencedItemIds ?? [],
    })
    .catch(() => {});

  // Build the system prompt — degrade gracefully if embeddings fail.
  let systemPrompt: string;
  try {
    systemPrompt = await buildSystemPrompt({
      userId,
      query: lastUserMessage.content,
      referencedItemIds: body.referencedItemIds ?? [],
    });
  } catch {
    systemPrompt =
      "你是「ZenoNews」的个人新闻编辑助手。用中文简洁回答，不要编造产品细节。";
  }

  const tools = buildAgentTools({ userId, sessionId });

  const messages: CoreMessage[] = body.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const result = streamText({
    model: openai(CHAT_MODEL),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 6,
    temperature: 0.5,
    onFinish: async ({ text }) => {
      try {
        await db.insert(chatMessages).values({
          sessionId: sessionId!,
          role: "assistant",
          content: { text },
          referencedItemIds: body.referencedItemIds ?? [],
        });
        await db
          .update(chatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(chatSessions.id, sessionId!));
      } catch {
        // Persistence is best-effort.
      }
      // Background fact extraction — fire and forget.
      void (async () => {
        try {
          const knownFacts = (
            await retrieveRelevantFacts({
              userId,
              query: lastUserMessage.content,
              k: 12,
            })
          ).map((f) => f.fact);
          const recent = body.messages.slice(-6).map((m) => ({
            role: m.role,
            text: m.content,
          }));
          recent.push({ role: "assistant", text });
          await extractFactsFromTurns({
            userId,
            sessionId: sessionId!,
            recentTurns: recent,
            knownFacts,
          });
        } catch {
          // Non-critical.
        }
      })();
    },
  });

  return result.toDataStreamResponse();
}

export async function GET(req: Request) {
  // Returns the most recent N sessions for the signed-in user (for the chat
  // sidebar). `?session=<id>` returns its messages.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const sid = url.searchParams.get("session");
  if (sid) {
    const owned = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sid))
      .limit(1);
    if (!owned[0] || owned[0].userId !== session.user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sid))
      .orderBy(chatMessages.createdAt);
    return NextResponse.json({ session: owned[0], messages: msgs });
  }
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, session.user.id))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(20);
  return NextResponse.json({ sessions });
}
