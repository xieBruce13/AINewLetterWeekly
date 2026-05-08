"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CardImageProps {
  image: string | null;
  /** Used for alt text + the no-image fallback panel. */
  company: string;
  name: string;
  slug: string;
  /** Tailwind classes that size the component. Pass `fill` if the parent
   *  is already sized and should be filled (e.g. small thumbnails). */
  aspect: string | "fill";
  sizes: string;
  rounded?: string;
  /** Honour priority for above-the-fold cards (faster LCP). */
  priority?: boolean;
}

/** Common patterns for "this URL is a logo / wordmark, not a photo". */
const LOGO_HOST_PATTERNS = [
  /upload\.wikimedia\.org/i,
  /wikipedia\.org/i,
  /\.svg($|\?)/i,
  /\/logo[^/]*\.(png|jpe?g|webp|svg)/i,
  /\/wordmark[^/]*\.(png|jpe?g|webp|svg)/i,
  /\/brand[^/]*\.(png|jpe?g|webp|svg)/i,
];

function isLogoUrl(url: string): boolean {
  return LOGO_HOST_PATTERNS.some((rx) => rx.test(url));
}

const NO_IMAGE_PALETTE = [
  "from-claude-coral/20 to-claude-coral/5",
  "from-amber-300/25 to-amber-100/10",
  "from-emerald-300/25 to-emerald-100/10",
  "from-sky-300/25 to-sky-100/10",
  "from-indigo-300/25 to-indigo-100/10",
  "from-rose-300/25 to-rose-100/10",
  "from-violet-300/25 to-violet-100/10",
];

function paletteFor(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return NO_IMAGE_PALETTE[Math.abs(h) % NO_IMAGE_PALETTE.length];
}

/**
 * Image slot for any news card — both Wired and compact variants.
 *
 * Why this is a client component:
 *   - We need `onError` to swap in the gradient placeholder when a
 *     third-party image URL 404s after deploy. Server-rendered <img>
 *     tags can't recover from this without a full page reload.
 *
 * Logo vs photo handling:
 *   - URLs from logo sources (Wikimedia, *.svg, …/logo*.*) are wide
 *     wordmarks. `object-cover` on a 4:3 panel zooms into the middle
 *     ("em" out of "Gemini"), which looks broken. For those we use
 *     `object-contain` with extra padding and a subtle background.
 *   - Real article hero photos still use `object-cover` so they fill
 *     the panel edge-to-edge.
 */
export function CardImage({
  image,
  company,
  name,
  slug,
  aspect,
  sizes,
  rounded,
  priority,
}: CardImageProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!image && !errored;
  const isLogo = !!image && isLogoUrl(image);
  const palette = paletteFor(company || name || slug);

  // `fill` mode: the parent is already sized, so we render a positioned
  // overlay instead of our own sized box. Used by tiny thumbnails where
  // aspect classes would conflict with the parent's fixed h/w.
  const isFill = aspect === "fill";
  const containerClass = isFill ? "absolute inset-0" : cn("relative w-full", aspect);

  if (!showImage) {
    const initial = (company || name || "?").trim().slice(0, 1).toUpperCase();
    return (
      <div
        className={cn(
          "overflow-hidden bg-gradient-to-br",
          palette,
          containerClass,
          rounded
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center font-display tracking-display text-claude-coral/60",
            isFill ? "text-[18px]" : "text-[64px] md:text-[88px]"
          )}
        >
          {initial}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden",
        // Logo backdrop matches the no-image palette so a logo card
        // doesn't sit on a stark white panel.
        isLogo ? `bg-gradient-to-br ${palette}` : "bg-claude-surface-card",
        containerClass,
        rounded
      )}
    >
      <Image
        src={image as string}
        alt={`${company} ${name}`.trim()}
        fill
        sizes={sizes}
        priority={priority}
        className={cn(
          "transition-transform duration-300",
          isLogo
            // Padding scales with the component: thumbnails get a tiny
            // breathing room, full cards get generous margins so the
            // wordmark doesn't fill the entire frame.
            ? isFill
              ? "object-contain p-2"
              : "object-contain p-6 md:p-10"
            : "object-cover group-hover:scale-[1.02]"
        )}
        // Let Next.js's image optimizer proxy the request server-side.
        // This sidesteps browser hotlink/referer blocks (Wikimedia, etc.)
        // that turn the gradient placeholder into the de-facto card. If
        // the upstream URL 404s the optimizer returns 4xx and `onError`
        // below swaps in the gradient.
        onError={() => setErrored(true)}
      />
    </div>
  );
}
