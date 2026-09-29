import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { resolveLink } from "@/lib/links/repository";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

// Reached only through the proxy's rewrite of ktha.is/<slug>.
export default async function RedirectPage({ params }: PageProps<"/r/[slug]">) {
  await connection(); // Render per request, so every visit is counted.
  const slug = normalizeSlug((await params).slug);
  if (!isValidSlug(slug)) notFound();

  const target = await resolveLink(getDb(), slug);
  if (!target) notFound();
  redirect(target);
}
