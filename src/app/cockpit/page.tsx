import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";
import { leaseNextLeads, getDialerConfig, getCallSlots } from "@/app/actions/dialer";
import { canAccessList } from "@/lib/lists";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; leadId?: string }>;
}) {
  const { listId } = await searchParams;
  const user = await requireAuth();

  // Dialern körs alltid mot en ringlista. Utan listId finns ingen kö att ringa.
  if (!listId) redirect("/lists");

  // Åtkomstkontroll före allt annat — samma svar oavsett om mappen inte finns
  // eller om användaren saknar behörighet, så existensen inte avslöjas.
  const [allowed, list] = await Promise.all([
    canAccessList(user, listId),
    db.callList.findUnique({ where: { id: listId }, select: { name: true } }),
  ]);
  if (!allowed || !list) redirect("/lists");

  // Leasen ersätter den gamla findMany som skickade samma 200 leads i samma
  // ordning till varje säljare. Nu får varje säljare ett eget, reserverat
  // block — två personer kan aldrig få samma bolag.
  const [leads, stages, config, slots] = await Promise.all([
    leaseNextLeads(listId),
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    getDialerConfig(),
    getCallSlots(),
  ]);

  return (
    <CockpitDb
      initialLeads={leads}
      userId={user.id}
      stages={stages}
      listId={listId}
      listName={list.name}
      leaseMinutes={config.leaseMinutes}
      slots={slots}
    />
  );
}
