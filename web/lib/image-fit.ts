/**
 * Decide between `object-cover` (fill, allow crop) and `object-contain`
 * (letterbox, no crop) for news images.
 *
 * Two layers, in priority order:
 *   1. URL heuristics — if the URL looks like a logo / wordmark / SVG /
 *      OG sharing image, we letterbox up front to avoid the wordmark
 *      getting cropped to a letter or two.
 *   2. Aspect-ratio fallback — once the browser has the image, we compare
 *      its natural aspect to the container's aspect; if they differ by
 *      more than `tolerance`, switch to `contain` so we don't zoom-crop
 *      40% of a 3:1 banner into a 16:9 box.
 *
 * Both functions are pure and shared by `CardImage` (lists) and the
 * detail-page hero so list and hero make the same decision for the
 * same URL.
 */

const LETTERBOX_PATTERNS: RegExp[] = [
  /upload\.wikimedia\.org/i,
  /wikipedia\.org/i,
  /\.svg($|\?)/i,
  /\/logo[^/]*\.(png|jpe?g|webp|svg)/i,
  /\/wordmark[^/]*\.(png|jpe?g|webp|svg)/i,
  /\/brand[^/]*\.(png|jpe?g|webp|svg)/i,
  // Common OG / social-share image filename conventions. These are
  // designed for 1.91:1 link previews and almost always lose key info
  // when forced into a 4:3 / square container with `cover`.
  /og[-_]?image/i,
  /opengraph[-_]?image/i,
  /\/og\//i,
  /social[-_](?:share|preview|card|image)/i,
  /sharing[-_]?image/i,
];

export function shouldLetterbox(url: string | null | undefined): boolean {
  if (!url) return false;
  // Unsplash covers are pre-cropped to 16:9 by the publish-time script, so
  // they should always fill the slot — no letterbox even if the URL happens
  // to match a wordmark-ish heuristic.
  if (isUnsplashUrl(url)) return false;
  return LETTERBOX_PATTERNS.some((rx) => rx.test(url));
}

export function isUnsplashUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(?:^|\/\/)images\.unsplash\.com\//i.test(url);
}

/**
 * Pick `cover` vs `contain` from the natural and container aspect ratios.
 * Returns `contain` when they differ by more than `tolerance` (relative,
 * not absolute), which means the image would lose more than ~tolerance
 * of one side to a `cover` crop.
 */
export function fitFromAspect(
  natural: { width: number; height: number },
  container: { width: number; height: number },
  tolerance = 0.22
): "cover" | "contain" {
  if (
    !natural.width ||
    !natural.height ||
    !container.width ||
    !container.height
  ) {
    return "cover";
  }
  const naturalAspect = natural.width / natural.height;
  const containerAspect = container.width / container.height;
  const ratio = Math.abs(naturalAspect - containerAspect) / Math.max(naturalAspect, containerAspect);
  return ratio > tolerance ? "contain" : "cover";
}
