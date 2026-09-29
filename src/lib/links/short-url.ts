/** Full short link, e.g. "https://ktha.is/apply". Used for copying and in QR codes. */
export function shortLinkUrl(shortUrl: string, slug: string): string {
  return `${new URL(shortUrl).origin}/${slug}`;
}

/** Display form without the scheme, e.g. "ktha.is/apply". */
export function shortLinkLabel(shortUrl: string, slug: string): string {
  return `${new URL(shortUrl).host}/${slug}`;
}
