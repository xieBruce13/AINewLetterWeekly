"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, sqlClient } from "@/lib/db/client";
import { memoryFacts, userProfiles } from "@/lib/db/schema";
import { embedText, toVectorLiteral } from "@/lib/embeddings";
import { eq } from "drizzle-orm";
import { invalidateRerankCache } from "@/lib/personalization/rerank";

function splitChips(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}

export async function saveProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const role = (formData.get("role") as string)?.trim() || null;
  const company = (formData.get("company") as string)?.trim() || null;
  const currentProjects =
    (formData.get("current_projects") as string)?.trim() || null;
  const focusTopics = splitChips(formData.get("focus_topics") as string);
  const dislikes = splitChips(formData.get("dislikes") as string);

  const summary = [
    role && `Role: ${role}.`,
    company && `Works at ${company}.`,
    currentProjects && `Currently working on: ${currentProjects}.`,
    focusTopics.length && `Cares about: ${focusTopics.join(", ")}.`,
    dislikes.length && `Doesn't care about: ${dislikes.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");

  let embeddingLiteral: string | null = null;
  if (summary && process.env.OPENAI_API_KEY) {
    const vec = await embedText(summary);
    embeddingLiteral = toVectorLiteral(vec);
  }

  // Upsert the profile row. We use raw SQL because profile_embedding is a
  // pgvector column and Drizzle's vector custom type can't be passed through
  // ON CONFLICT cleanly without an extra round-trip.
  await sqlClient`
    INSERT INTO user_profiles (
      user_id, role, company, current_projects,
      focus_topics, dislikes, profile_embedding,
      onboarded_at, updated_at
    ) VALUES (
      ${session.user.id}, ${role}, ${company}, ${currentProjects},
      ${focusTopics}, ${dislikes},
      ${embeddingLiteral ? sqlClient`${embeddingLiteral}::vector` : null},
      now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      role             = EXCLUDED.role,
      company          = EXCLUDED.company,
      current_projects = EXCLUDED.current_projects,
      focus_topics     = EXCLUDED.focus_topics,
      dislikes         = EXCLUDED.dislikes,
      profile_embedding = COALESCE(EXCLUDED.profile_embedding, user_profiles.profile_embedding),
      onboarded_at     = COALESCE(user_profiles.onboarded_at, now()),
      updated_at       = now()
  `;

  // Seed memory_facts from explicit onboarding so the chat agent can recall
  // the same context on day 1.
  if (summary) {
    const facts = [
      role && `User's role is ${role}.`,
      company && `User works at ${company}.`,
      currentProjects && `User is currently working on: ${currentProjects}.`,
      ...focusTopics.map((t) => `User cares about ${t}.`),
      ...dislikes.map((t) => `User does NOT want coverage of ${t}.`),
    ].filter(Boolean) as string[];

    for (const fact of facts) {
      let factEmbedding: string | null = null;
      if (process.env.OPENAI_API_KEY) {
        try {
          const vec = await embedText(fact);
          factEmbedding = toVectorLiteral(vec);
        } catch {
          factEmbedding = null;
        }
      }
      await sqlClient`
        INSERT INTO memory_facts (user_id, fact, embedding, source, confidence)
        VALUES (
          ${session.user.id}, ${fact},
          ${factEmbedding ? sqlClient`${factEmbedding}::vector` : null},
          'explicit-onboarding', 90
        )
        ON CONFLICT (user_id, fact) DO NOTHING
      `;
    }
  }

  await invalidateRerankCache(session.user.id);
  redirect("/");
}

/**
 * "Skip for now" — record that onboarding was *seen* (so we don't bounce
 * the user back here on every page load) but leave all profile fields
 * empty. The home page treats an empty profile as anonymous-feed mode.
 */
export async function skipProfile() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await sqlClient`
    INSERT INTO user_profiles (user_id, onboarded_at, updated_at)
    VALUES (${session.user.id}, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      onboarded_at = COALESCE(user_profiles.onboarded_at, now()),
      updated_at   = now()
  `;
  redirect("/");
}

export async function deleteProfile() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await db.delete(memoryFacts).where(eq(memoryFacts.userId, session.user.id));
  await db
    .delete(userProfiles)
    .where(eq(userProfiles.userId, session.user.id));
  await invalidateRerankCache(session.user.id);
  redirect("/onboarding");
}
