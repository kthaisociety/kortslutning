import Form from "next/form";
import { CreateLinkForm } from "@/components/create-link-form";
import { LinksTable } from "@/components/links-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { listLinks } from "@/lib/links/repository";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const { shortUrl } = getEnv();
  const links = await listLinks(getDb(), { query });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Create a short link</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLinkForm shortUrl={shortUrl} />
        </CardContent>
      </Card>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">All links</h2>
          <Form action="/" className="flex gap-2">
            <Input
              name="q"
              type="search"
              placeholder="Search slug or URL"
              defaultValue={query}
              aria-label="Search links"
              className="w-64"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </Form>
        </div>
        <LinksTable links={links} shortUrl={shortUrl} query={query} />
      </section>
    </div>
  );
}
