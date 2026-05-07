import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

export const EMBED_DIM = 1536;
const model = openai.embedding("text-embedding-3-small");

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 8000) || "(empty)";
  const { embedding } = await embed({ model, value: trimmed });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const trimmed = texts.map((t) => t.trim().slice(0, 8000) || "(empty)");
  const { embeddings } = await embedMany({ model, values: trimmed });
  return embeddings;
}

/** Format a JS number array as a pgvector literal. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => v.toFixed(7)).join(",")}]`;
}
