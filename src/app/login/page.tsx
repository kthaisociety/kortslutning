import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOMAIN_ERROR_MESSAGE } from "@/lib/auth/domain";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Image src="/kthais-logo.svg" alt="" width={48} height={48} className="mx-auto" />
          <CardTitle className="text-xl">ktha.is</CardTitle>
          <CardDescription>KTH AI Society&apos;s link shortener</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error !== undefined && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Sign-in failed. {DOMAIN_ERROR_MESSAGE}
            </p>
          )}
          <SignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
