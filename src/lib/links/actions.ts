"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createLink, type FieldErrors } from "./service";

export interface LinkFormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values, echoed back on error so the form keeps them. */
  values?: { slug: string; targetUrl: string };
  /** Set after a successful create. */
  createdSlug?: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createLinkAction(_previous: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const user = await requireUser();
  const values = { slug: readField(formData, "slug"), targetUrl: readField(formData, "targetUrl") };
  try {
    const result = await createLink(getDb(), { userId: user.id, ...values, shortUrl: getEnv().shortUrl });
    if (!result.ok) return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
    revalidatePath("/");
    return { status: "success", createdSlug: result.slug };
  } catch (error) {
    console.error("createLinkAction failed", error);
    return { status: "error", message: GENERIC_ERROR, values };
  }
}
