import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";
import { freeLeadWhere, visibleLeadWhere } from "@/lib/lists";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

/**
 * Hur många leads som skickas till dialern per sidladdning. Säljaren betar av
 * kön en i taget, så hela listan behöver aldrig ligga i klientens minne —
 * taket håller payloaden liten oavsett hur stor mappen är.
 */
const DIALER_QUEUE_SIZE = 200;

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; leadId?: string }>;
}) {
  const { listId, leadId } = await searchParams;
  const user = await requireAuth();

  // Dialern körs alltid mot en ringlista. Utan listId finns ingen kö att ringa,
  // så skicka användaren till listvyn för att välja mapp först.
  if (!listId) redirect("/lists");

  // Man ringer bara leads som är LEDIGA eller redan låsta till en själv —
  // andras aktiva claims dyker aldrig upp i dialern.
  const dialable = { OR: [freeLeadWhere(), { ownerId: user.id }] };

  // Samma include på båda lead-frågorna så typerna blir identiska
  const leadInclude = {
    contacts: { orderBy: { createdAt: "asc" } },
    activities: {
      where: { type: { in: ["CALL", "CALL_NO_ANSWER"] } },
      orderBy: { timestamp: "desc" },
      take: 1,
      select: { timestamp: true },
    },
  } satisfies Prisma.LeadInclude;

  // Alla frågorna är oberoende → en round-trip i stället för fyra.
  // Åtkomstkontrollen ligger i mappfrågan: hittas ingen mapp har användaren
  // antingen fel id eller saknar behörighet, och vi skickar dem till /lists.
  const [list, leads, stages, focusLead] = await Promise.all([
    db.callList.findFirst({
      where: {
        id: listId,
        ...(user.role === "ADMIN" ? {} : { access: { some: { userId: user.id } } }),
      },
      select: { name: true },
    }),

    db.lead.findMany({
      where: {
        AND: [
          visibleLeadWhere(user),
          dialable,
          { lists: { some: { listId } } },
          { contacts: { some: {} }, hasActiveDeal: false },
        ],
      },
      orderBy: { updatedAt: "asc" },
      // Dialern jobbar sig igenom kön en i taget — hela listan behöver aldrig
      // ligga i klientens minne. Taket håller payloaden liten även på 10 000 leads.
      take: DIALER_QUEUE_SIZE,
      include: leadInclude,
    }),

    // Fetch pipeline stages for the CreateDeal modal
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),

    // Kom man hit via "Ring" på en specifik rad kan det leadet ligga utanför
    // de första DIALER_QUEUE_SIZE — hämta det separat så det garanterat finns.
    leadId
      ? db.lead.findFirst({
          where: { AND: [{ id: leadId }, visibleLeadWhere(user), dialable] },
          include: leadInclude,
        })
      : Promise.resolve(null),
  ]);

  // Ingen mapp hittad = fel id eller ingen behörighet. Samma svar i båda fallen,
  // så vi inte avslöjar att mappen existerar.
  if (!list) redirect("/lists");

  // Startade man från en specifik rad ska den ligga först i kön
  const ordered = focusLead
    ? [focusLead, ...leads.filter((l) => l.id !== focusLead.id)]
    : leads;

  return (
    <CockpitDb
      leads={ordered}
      userId={user.id}
      stages={stages}
      listId={listId}
      listName={list.name}
    />
  );
}
