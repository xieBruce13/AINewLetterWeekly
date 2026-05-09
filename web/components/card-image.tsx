"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fitFromAspect, isUnsplashUrl, shouldLetterbox } from "@/lib/image-fit";

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
 *     third-party image URL 404s after deploy.
 *   - We measure the loaded image's natural aspect against the
 *     container so we can letterbox extreme-ratio images instead of
 *     zoom-cropping them.
 *
 * Cover vs contain (see [lib/image-fit.ts](web/lib/image-fit.ts)):
 *   - URL heuristic up front: logos / wordmarks / SVG / OG share images
 *     start as `contain` so we don't render a card with just "arr" or
 *     "mazo" cropped out of a wordmark.
 *   - Real article photos start as `cover`; once loaded, if the natural
 *     aspect differs from the container's by >~22% we promote them to
 *     `contain` so wide UI screenshots and tall vertical mocks get
 *     shown in full instead of clipped.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [errored, setErrored] = useState(false);
  const [autoFit, setAutoFit] = useState<"cover" | "contain" | null>(null);

  const showImage = !!image && !errored;
  const palette = paletteFor(company || name || slug);

  // `fill` mode: parent is already sized so we render an absolute
  // overlay. Used by tiny thumbnails where aspect classes would conflict
  // with the parent's fixed h/w.
  const isFill = aspect === "fill";
  const containerClass = isFill ? "absolute inset-0" : cn("relative w-full", aspect);

  // URL hint wins immediately (avoids a frame of cropped wordmark).
  // The aspect-ratio measurement only ever flips us TO `contain`, never
  // back to `cover`, which keeps the transition one-way and unflickery.
  // Unsplash covers are pre-cropped to 16:9 by the publish step, so we
  // pin them to `cover` and skip the auto-fit measurement entirely —
  // that removes the colored frame around editorial photos.
  const forceCover = isUnsplashUrl(image);
  const urlLetterbox = forceCover ? false : shouldLetterbox(image);
  const isLetterbox = !forceCover && (urlLetterbox || autoFit === "contain");

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
      ref={containerRef}
      className={cn(
        "overflow-hidden",
        // Both letterboxed and cover slots use the neutral card surface as
        // backdrop. The previous gradient palette read as a colored frame
        // around photos that landed on `contain`; the neutral surface keeps
        // the eye on the image.
        "bg-claude-surface-card",
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
          isLetterbox
            // Padding scales with the slot: thumbnails get a tiny
            // breathing room, full cards get generous margins so a
            // wordmark doesn't fill the entire frame.
            ? isFill
              ? "object-contain p-2"
              : "object-contain p-6 md:p-10"
            : "object-cover group-hover:scale-[1.02]"
        )}
        onLoad={(e) => {
          // Skip if the URL already letterboxed or we've pinned to cover;
          // the measurement would only confirm it (or worse, fight it).
          if (urlLetterbox || forceCover) return;
          const img = e.currentTarget;
          const box = containerRef.current?.getBoundingClientRect();
          if (!box || !box.width || !box.height) return;
          const fit = fitFromAspect(
            { width: img.naturalWidth, height: img.naturalHeight },
            { width: box.width, height: box.height }
          );
          if (fit === "contain") setAutoFit("contain");
        }}
        // Routed through Next.js' image optimizer so we get a server-side
        // fetch (avoids browser hotlink/referer blocks) and WebP. If the
        // upstream URL 404s the optimizer returns 4xx and `onError` below
        // swaps in the gradient.
        onError={() => setErrored(true)}
      />
    </div>
  );
}
