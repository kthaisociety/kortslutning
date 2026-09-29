"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLinkAction, type LinkFormState } from "@/lib/links/actions";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";
import { cn } from "@/lib/utils";

const initialState: LinkFormState = { status: "idle" };

export function CreateLinkForm({ shortUrl }: { shortUrl: string }) {
  const [state, formAction, pending] = useActionState(createLinkAction, initialState);
  const slugError = state.fieldErrors?.slug;
  const targetError = state.fieldErrors?.targetUrl;

  useEffect(() => {
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
        <div className="grid gap-1.5">
          <Label htmlFor="slug">Short link</Label>
          <div
            className={cn(
              "flex h-8 items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50",
              slugError && "border-destructive",
            )}
          >
            <span className="pl-2.5 text-sm text-muted-foreground">{new URL(shortUrl).host}/</span>
            <Input
              id="slug"
              name="slug"
              placeholder="random"
              autoComplete="off"
              spellCheck={false}
              defaultValue={state.values?.slug}
              aria-invalid={slugError ? true : undefined}
              aria-describedby={slugError ? "slug-error" : undefined}
              className="h-full flex-1 rounded-none border-0 bg-transparent pl-0.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {slugError && (
            <p id="slug-error" className="text-sm text-destructive">
              {slugError}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetUrl">Destination URL</Label>
          <Input
            id="targetUrl"
            name="targetUrl"
            type="url"
            required
            placeholder="https://…"
            defaultValue={state.values?.targetUrl}
            aria-invalid={targetError ? true : undefined}
            aria-describedby={targetError ? "target-error" : undefined}
          />
          {targetError && (
            <p id="target-error" className="text-sm text-destructive">
              {targetError}
            </p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending ? "Creating…" : "Create link"}
        </Button>
      </form>
      {state.status === "success" && state.createdSlug && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Created</span>
          <a
            href={shortLinkUrl(shortUrl, state.createdSlug)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {shortLinkLabel(shortUrl, state.createdSlug)}
          </a>
          <CopyButton value={shortLinkUrl(shortUrl, state.createdSlug)} />
        </div>
      )}
    </div>
  );
}
