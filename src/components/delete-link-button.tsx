"use client";

import { Trash2Icon } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { LinkFormState } from "@/lib/links/actions";

const initialState: LinkFormState = { status: "idle" };

export function DeleteLinkButton({ action, label }: { action: () => Promise<LinkFormState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2Icon />
        Delete link
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone who opens this link or scans its QR code will see “Link not found”. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
