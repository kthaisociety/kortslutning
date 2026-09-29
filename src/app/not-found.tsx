import Image from "next/image";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Image src="/kthais-logo.svg" alt="KTH AI Society" width={56} height={56} />
      <h1 className="text-2xl font-semibold">Link not found</h1>
      <p className="max-w-sm text-muted-foreground">
        This link doesn&apos;t exist or has been removed. Check it for typos, or ask whoever shared it with you.
      </p>
    </main>
  );
}
