/**
 * Brand-specific background colors and logo sizing hints for known companies.
 * Applied by CardImage when a cover is letterboxed (object-contain) — i.e.
 * logos, wordmarks, SVGs, and self-hosted brand assets.
 *
 * bg:      CSS color for the slot backdrop (any valid CSS color string).
 * compact: true → extra padding so an oversized logo is shrunk inside the
 *          frame. Use for logos whose natural aspect ratio nearly fills a
 *          16:9 or 4:3 slot at full contain size (e.g. NVIDIA stacked mark).
 */
export interface BrandConfig {
  bg: string;
  compact?: boolean;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Ordered list of [company-name-pattern, config].
 * First match wins. Matching is case-insensitive exact (after normalisation),
 * so "Google DeepMind" and "Google" both have entries without ambiguity.
 */
const ENTRIES: [string, BrandConfig][] = [
  // ── Dark-background brands ────────────────────────────────────────────────
  // Logos are white / light on dark, so a dark backdrop is required.
  ["openai",              { bg: "#000000" }],
  ["nvidia",              { bg: "#1a1a1a", compact: true }],
  ["perplexity",          { bg: "#1b1b1b" }],
  ["cursor",              { bg: "#000000" }],
  ["vercel",              { bg: "#000000" }],
  ["mistral",             { bg: "#1a1a1a" }],
  ["langchain",           { bg: "#1c1c1c" }],
  ["stability ai",        { bg: "#1a1a1a" }],

  // ── Coloured brand backgrounds ────────────────────────────────────────────
  // Taken from each company's official brand palette.
  ["figma",               { bg: "#a259e0" }],   // Figma brand purple
  ["anthropic",           { bg: "#f5ede3" }],   // soft coral/cream
  ["hugging face",        { bg: "#fff4e5" }],   // HF warm orange tint
  ["lovable",             { bg: "#ffe4e1" }],   // Lovable blush
  ["suno",                { bg: "#0e0e0e" }],   // Suno dark
  ["runway",              { bg: "#0a0a0a" }],   // Runway dark

  // ── White / near-white brands ─────────────────────────────────────────────
  // These have dark-coloured logos that look fine on white.
  // Explicitly setting white ensures they stay white even in dark mode,
  // which is correct for brand identity.
  ["google deepmind",     { bg: "#ffffff" }],
  ["google",              { bg: "#ffffff" }],
  ["amazon",              { bg: "#ffffff" }],
  ["microsoft",           { bg: "#ffffff" }],
  ["apple",               { bg: "#f5f5f7" }],
  ["meta",                { bg: "#ffffff" }],
  ["luma ai",             { bg: "#ffffff" }],
  ["luma",                { bg: "#ffffff" }],
  ["together ai",         { bg: "#ffffff" }],
  ["cohere",              { bg: "#ffffff" }],
  ["notion",              { bg: "#ffffff" }],
  ["adobe",               { bg: "#ffffff" }],
  ["servicenow",          { bg: "#ffffff" }],
  ["cloudflare",          { bg: "#ffffff" }],
  ["deepseek",            { bg: "#ffffff" }],
  ["xai",                 { bg: "#000000" }],
  ["x.ai",                { bg: "#000000" }],
  ["tomofun",             { bg: "#ffffff" }],
];

const MAP = new Map<string, BrandConfig>(
  ENTRIES.map(([name, cfg]) => [norm(name), cfg])
);

export function brandConfigFor(company: string | null | undefined): BrandConfig | null {
  if (!company) return null;
  return MAP.get(norm(company)) ?? null;
}
