/**
 * Photo URL convention shared by Photo.astro (server) and client code (cart drawer, cards).
 * A photo slug from research/photos.json is served as
 *   /photos/<slug>-<width>.<avif|webp|jpg>
 * at the widths in PHOTO_WIDTHS — the pipeline's research/photos.json `web_variants.widths`
 * (2560 only for a few heroes, so client code never asks for it). Anything that already looks
 * like a URL (starts with "/" or "http") is used as is (admin uploads live under /media/).
 */
export const PHOTO_WIDTHS = [640, 1280, 1920] as const;

export function isUrl(s: string): boolean {
  return s.startsWith('/') || /^https?:\/\//.test(s);
}

export function photoSrc(slugOrUrl: string, width: number = 640, fmt: 'avif' | 'webp' | 'jpg' = 'webp'): string {
  if (isUrl(slugOrUrl)) return slugOrUrl;
  // smallest pipeline width that covers the request (else the largest)
  const w = PHOTO_WIDTHS.find((x) => x >= width) ?? PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];
  return `/photos/${encodeURIComponent(slugOrUrl)}-${w}.${fmt}`;
}
