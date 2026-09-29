import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { DeleteLinkButton } from "@/components/delete-link-button";
import { EditLinkForm } from "@/components/edit-link-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { deleteLinkAction, updateLinkAction } from "@/lib/links/actions";
import { getLink } from "@/lib/links/repository";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

function byline(name: string | null): string {
  return name ? ` by ${name}` : "";
}

export default async function LinkPage({ params }: PageProps<"/links/[slug]">) {
  await requireUser();
  const slug = normalizeSlug((await params).slug);
  if (!isValidSlug(slug)) notFound();
  const link = await getLink(getDb(), slug);
  if (!link) notFound();

  const { shortUrl } = getEnv();
  const url = shortLinkUrl(shortUrl, slug);
  const label = shortLinkLabel(shortUrl, slug);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
        <ArrowLeftIcon />
        All links
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{label}</h1>
        <CopyButton value={url} />
      </div>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Destination</CardTitle>
            </CardHeader>
            <CardContent>
              <EditLinkForm action={updateLinkAction.bind(null, slug)} targetUrl={link.targetUrl} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Clicks</dt>
                <dd className="tabular-nums">{link.clickCount}</dd>
                <dt className="text-muted-foreground">Last clicked</dt>
                <dd>{formatDateTime(link.lastClickedAt)}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>
                  {formatDateTime(link.createdAt)}
                  {byline(link.createdByName)}
                </dd>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd>
                  {formatDateTime(link.updatedAt)}
                  {byline(link.updatedByName)}
                </dd>
              </dl>
            </CardContent>
          </Card>
          <div>
            <DeleteLinkButton action={deleteLinkAction.bind(null, slug)} label={label} />
          </div>
        </div>
      </div>
    </div>
  );
}
