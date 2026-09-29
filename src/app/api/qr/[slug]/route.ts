import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isQrFormat, qrFilename, renderQrPng, renderQrSvg } from "@/lib/links/qr";
import { getLink } from "@/lib/links/repository";
import { shortLinkUrl } from "@/lib/links/short-url";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/qr/[slug]">) {
  await requireUser();
  const slug = normalizeSlug((await params).slug);
  const format = request.nextUrl.searchParams.get("format") ?? "svg";
  if (!isQrFormat(format)) return new Response("Unknown format. Use svg or png.", { status: 400 });
  if (!isValidSlug(slug) || !(await getLink(getDb(), slug))) return new Response("Link not found.", { status: 404 });

  const { shortUrl } = getEnv();
  // Encode the short link, not the target: scans are counted and the target can change without reprinting.
  const text = shortLinkUrl(shortUrl, slug);
  const headers = {
    "Content-Disposition": `attachment; filename="${qrFilename(shortUrl, slug, format)}"`,
    "Cache-Control": "private, no-store",
  };
  if (format === "svg") {
    return new Response(await renderQrSvg(text), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  return new Response(await renderQrPng(text), { headers: { ...headers, "Content-Type": "image/png" } });
}
