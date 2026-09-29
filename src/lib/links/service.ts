import type { Database } from "@/lib/db";
import { deleteLink, insertLink, updateLinkTarget } from "./repository";
import { shortLinkLabel } from "./short-url";
import { generateRandomSlug } from "./slug";
import { normalizeSlug, parseSlugInput, parseTargetUrl } from "./validation";

export type FieldErrors = Partial<Record<"slug" | "targetUrl", string>>;
export type LinkFailure = { ok: false; fieldErrors?: FieldErrors; message?: string };
export type CreateLinkResult = { ok: true; slug: string } | LinkFailure;
export type MutationResult = { ok: true } | LinkFailure;

export const MAX_RANDOM_SLUG_ATTEMPTS = 5;
export const LINK_GONE_MESSAGE = "This link no longer exists.";
export const RANDOM_SLUG_EXHAUSTED_MESSAGE = "Couldn't find a free random slug. Try again, or choose one yourself.";

export interface CreateLinkInput {
  userId: string;
  /** Raw form value; blank means "generate a random slug". */
  slug: string;
  targetUrl: string;
  shortUrl: string;
  /** Injectable for tests. */
  generateSlug?: () => string;
}

export async function createLink(db: Database, input: CreateLinkInput): Promise<CreateLinkResult> {
  const slug = parseSlugInput(input.slug);
  const targetUrl = parseTargetUrl(input.targetUrl, input.shortUrl);
  if (!slug.ok || !targetUrl.ok) {
    const fieldErrors: FieldErrors = {};
    if (!slug.ok) fieldErrors.slug = slug.error;
    if (!targetUrl.ok) fieldErrors.targetUrl = targetUrl.error;
    return { ok: false, fieldErrors };
  }

  if (slug.value !== null) {
    const inserted = await insertLink(db, { slug: slug.value, targetUrl: targetUrl.value, userId: input.userId });
    if (!inserted) {
      return { ok: false, fieldErrors: { slug: `${shortLinkLabel(input.shortUrl, slug.value)} is already taken.` } };
    }
    return { ok: true, slug: slug.value };
  }

  const generateSlug = input.generateSlug ?? (() => generateRandomSlug());
  for (let attempt = 0; attempt < MAX_RANDOM_SLUG_ATTEMPTS; attempt++) {
    const candidate = generateSlug();
    if (await insertLink(db, { slug: candidate, targetUrl: targetUrl.value, userId: input.userId })) {
      return { ok: true, slug: candidate };
    }
  }
  return { ok: false, message: RANDOM_SLUG_EXHAUSTED_MESSAGE };
}

export async function updateLink(
  db: Database,
  input: { userId: string; slug: string; targetUrl: string; shortUrl: string },
): Promise<MutationResult> {
  const targetUrl = parseTargetUrl(input.targetUrl, input.shortUrl);
  if (!targetUrl.ok) return { ok: false, fieldErrors: { targetUrl: targetUrl.error } };
  const updated = await updateLinkTarget(db, {
    slug: normalizeSlug(input.slug),
    targetUrl: targetUrl.value,
    userId: input.userId,
  });
  return updated ? { ok: true } : { ok: false, message: LINK_GONE_MESSAGE };
}

export async function removeLink(db: Database, slug: string): Promise<MutationResult> {
  const deleted = await deleteLink(db, normalizeSlug(slug));
  return deleted ? { ok: true } : { ok: false, message: LINK_GONE_MESSAGE };
}
