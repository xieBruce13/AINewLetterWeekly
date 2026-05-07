"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { memoryFacts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/** Delete a single memory fact, verifying ownership. */
export async function deleteMemoryFact(factId: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: "未登录" };

  await db
    .delete(memoryFacts)
    .where(
      and(
        eq(memoryFacts.id, factId),
        eq(memoryFacts.userId, session.user.id)
      )
    );

  revalidatePath("/profile");
  return { ok: true };
}
