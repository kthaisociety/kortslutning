import { QrCodeIcon } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { LinkRow } from "@/lib/links/repository";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";

export function LinksTable({ links, shortUrl, query }: { links: LinkRow[]; shortUrl: string; query: string }) {
  if (links.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {query ? `No links match “${query}”.` : "No links yet. Create the first one above."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Short link</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead>Last clicked</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>
            <span className="sr-only">QR code and settings</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => {
          const label = shortLinkLabel(shortUrl, link.slug);
          return (
            <TableRow key={link.slug}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-1">
                  <Link href={`/links/${link.slug}`} className="hover:underline">
                    {label}
                  </Link>
                  <CopyButton value={shortLinkUrl(shortUrl, link.slug)} />
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-72 truncate">
                  <a
                    href={link.targetUrl}
                    title={link.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:underline"
                  >
                    {link.targetUrl}
                  </a>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{link.clickCount}</TableCell>
              <TableCell>{formatDateTime(link.lastClickedAt)}</TableCell>
              <TableCell>{link.createdByName ?? "—"}</TableCell>
              <TableCell>{formatDateTime(link.updatedAt)}</TableCell>
              <TableCell>
                <Link
                  href={`/links/${link.slug}`}
                  aria-label={`QR code and settings for ${label}`}
                  title="QR code and settings"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                >
                  <QrCodeIcon />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
