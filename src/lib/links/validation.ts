/** 1–64 characters of a-z, 0-9 and "-", not starting or ending with "-". Mirrored by the links_slug_format DB constraint. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_TARGET_URL_LENGTH = 2048;

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Parses the optional slug field. `value: null` means "generate a random slug". */
export function parseSlugInput(raw: string): FieldResult<string | null> {
  const slug = normalizeSlug(raw);
  if (slug === "") return { ok: true, value: null };
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "Use 1–64 lowercase letters, digits or hyphens, not starting or ending with a hyphen.",
    };
  }
  return { ok: true, value: slug };
}

/** Parses a destination URL. The returned href is normalized and safe to send in a Location header. */
export function parseTargetUrl(raw: string, shortUrl: string): FieldResult<string> {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter the URL to redirect to." };

  const tooLong = { ok: false, error: `The URL can be at most ${MAX_TARGET_URL_LENGTH} characters.` } as const;
  if (value.length > MAX_TARGET_URL_LENGTH) return tooLong;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Enter a full URL, including https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// URLs are allowed." };
  }

  const shortHostname = new URL(shortUrl).hostname;
  // The www. alias routes like the short domain too (see shortHostAliases in src/lib/env.ts).
  const hostname = url.hostname.replace(/\.$/, "");
  if (hostname === shortHostname || hostname === `www.${shortHostname}`) {
    return { ok: false, error: `Links can't point to ${shortHostname} itself.` };
  }

  if (url.href.length > MAX_TARGET_URL_LENGTH) return tooLong;
  return { ok: true, value: url.href };
}

/** Escapes %, _ and \ so user input matches literally inside a LIKE/ILIKE pattern. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
