"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={label} title={label}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
