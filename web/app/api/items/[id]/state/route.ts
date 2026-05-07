import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, sqlClient } from "@/lib/db/client";
import { newsItems, userItemState, userProfiles } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { invalidateRerankCache } from "@/lib/personalization/rerank";

const ActionSchema = z.object({
  action: z.enum(["save", "dismiss", "like", "dislike"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const body = ActionSchema.parse(await req.json());

  const [existing] = await db
    .select()
    .from(userItemState)
    .where(
      and(
        eq(userItemState.userId, session.user.id),
        eq(userItemState.itemId, itemId)
      )
    )
    .limit(1);

  // Compute the next state (toggling semantics).
  const next = {
    saved: existing?.saved ?? false,
    dismissed: existing?.dismissed ?? false,
    reaction: existing?.reaction ?? null,
  };
  if (body.action === "save") next.saved = !next.saved;
  if (body.action === "dismiss") next.dismissed = !next.dismissed;
  if (body.action === "like")
    next.reaction = next.reaction === "like" ? null : "like";
  if (body.action === "dislike")
    next.reaction = next.reaction === "dislike" ? null : "dislike";

  if (existing) {
    await db
      .update(userItemState)
      .set({
        saved: next.saved,
        dismissed: next.dismissed,
        reaction: next.reaction,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userItemState.userId, session.user.id),
          eq(userItemState.itemId, itemId)
        )
      );
  } else {
    await db.insert(userItemState).values({
      userId: session.user.id,
      itemId,
      saved: next.saved,
      dismissed: next.dismissed,
      reaction: next.reaction,
      seenAt: new Date(),
    });
  }

  // Feedback-to-rerank loop:
  // - dismissing N items from a single company auto-adds it to dismissed_companies
  // - dislike on a tag-heavy item nudges the rerank cache to refresh
  if (body.action === "dismiss" && next.dismissed) {
    const [item] = await db
      .select({ company: newsItems.company })
      .from(newsItems)
      .where(eq(newsItems.id, itemId))
      .limit(1);
    if (item) {
      const dismissedFromCompany = await sqlClient<
        Array<{ count: number }>
      >`
        SELECT COUNT(*)::int AS count
        FROM user_item_state s
        JOIN news_items i ON i.id = s.item_id
        WHERE s.user_id = ${session.user.id}
          AND s.dismissed = true
          AND i.company = ${item.company}
      `;
      const n = dismissedFromCompany[0]?.count ?? 0;
      if (n >= 3) {
        await sqlClient`
          UPDATE user_profiles
          SET dismissed_companies = (
            SELECT array_agg(DISTINCT c) FROM unnest(
              array_append(dismissed_companies, ${item.company})
            ) AS c
          ),
          updated_at = now()
          WHERE user_id = ${session.user.id}
        `;
      }
    }
  }

  if (body.action === "dislike" && next.reaction === "dislike") {
    await invalidateRerankCache(session.user.id);
  }

  return NextResponse.json({ state: next });
}
