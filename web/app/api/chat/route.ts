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

// Single-key migration (2026-05-05): all generation goes through OpenAI now,
// embeddings already did. gpt-5-mini is ~10× cheaper than Claude Sonnet 4.5
// at comparable Chinese-output quality for short-form chat.
const CHAT_MODEL = "gpt-5-mini";

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

  const body = (await req.json()) as ChatRequestBody;
  const userId = session.user.id;

  // Resolve / create the chat session row.
  let sessionId = body.sessionId;
  if (!sessionId) {
    sessionId = randomUUID();
    await db.insert(chatSessions).values({
      id: sessionId,
      userId,
      title: body.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? null,
    });
  } else {
    // Confirm ownership.
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

  const lastUserMessage = [...body.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage) {
    return NextResponse.json({ error: "no user message" }, { status: 400 });
  }

  // Persist the latest user turn before streaming.
  await db.insert(chatMessages).values({
    sessionId,
    role: "user",
    content: { text: lastUserMessage.content },
    referencedItemIds: body.referencedItemIds ?? [],
  });

  const systemPrompt = await buildSystemPrompt({
    userId,
    query: lastUserMessage.content,
    referencedItemIds: body.referencedItemIds ?? [],
  });

  const tools = buildAgentTools({ userId, sessionId: sessionId! });

  const messages: CoreMessage[] = body.messages.map((m) => ({
    role: m.role,
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
        // Persistence is best-effort; never block the response.
      }
      // Background fact extraction — fire and forget.
      void (async () => {
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
