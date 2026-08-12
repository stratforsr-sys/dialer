import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOwnSummary } from "@/app/actions/stats";
import { SettingsView } from "@/components/settings/SettingsView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAuth();

  // Namnet läses ur databasen och inte ur sessionen. JWT:n bär en kopia som
  // sattes vid inloggning, och sidan där man ändrar namnet är det sämsta
  // stället att visa en inaktuell kopia på.
  const [user, summary] = await Promise.all([
    db.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, role: true, createdAt: true },
    }),
    getOwnSummary(30),
  ]);

  if (!user) redirect("/login");

  return (
    <SettingsView
      name={user.name}
      email={user.email}
      role={user.role}
      memberSince={user.createdAt.toISOString()}
      summary={summary}
    />
  );
}
