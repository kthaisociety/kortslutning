"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    // On failure Better Auth redirects to /login?error=<code>.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    if (error) {
      setPending(false);
      toast.error("Couldn't start sign-in. Please try again.");
    }
  }

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={signIn}>
      {pending ? "Redirecting to Google…" : "Sign in with Google"}
    </Button>
  );
}
