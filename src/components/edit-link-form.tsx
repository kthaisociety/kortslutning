"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LinkFormState } from "@/lib/links/actions";

const initialState: LinkFormState = { status: "idle" };

export function EditLinkForm({
  action,
  targetUrl,
}: {
  action: (state: LinkFormState, formData: FormData) => Promise<LinkFormState>;
  targetUrl: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const targetError = state.fieldErrors?.targetUrl;

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="targetUrl">Destination URL</Label>
        <Input
          id="targetUrl"
          name="targetUrl"
          type="url"
          required
          defaultValue={state.values?.targetUrl ?? targetUrl}
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
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
