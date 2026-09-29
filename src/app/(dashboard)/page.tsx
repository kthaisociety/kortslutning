import { requireUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await requireUser();
  return <p>Signed in as {user.email}.</p>;
}
