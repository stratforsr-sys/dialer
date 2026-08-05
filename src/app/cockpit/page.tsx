import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";
import { canAccessList, freeLeadWhere, visibleLeadWhere } from "@/lib/lists";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; leadId?: string }>;
}) {
  const { listId, leadId } = await searchParams;
  const user = await requireAuth();

  // Ringer man en specifik mapp måste man ha åtkomst till den
  let listName: string | null = null;
  if (listId) {
    if (!(await canAccessList(user, listId))) redirect("/lists");
    const list = await db.callList.findUnique({
      where: { id: listId },
      select: { name: true },
    });
    if (!list) redirect("/lists");
    listName = list.name;
  }

  // Man ringer bara leads som är LEDIGA eller redan låsta till en själv —
  // andras aktiva claims dyker aldrig upp i dialern.
  const dialable = { OR: [freeLeadWhere(), { ownerId: user.id }] };

  const leads = await db.lead.findMany({
    where: {
      AND: [
        visibleLeadWhere(user),
        dialable,
        listId ? { lists: { some: { listId } } } : {},
        { contacts: { some: {} }, hasActiveDeal: false },
      ],
    },
    orderBy: { updatedAt: "asc" },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      activities: {
        where: { type: { in: ["CALL", "CALL_NO_ANSWER"] } },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true },
      },
    },
  });

  // Startade man från en specifik rad ska den ligga först i kön
  const ordered = leadId
    ? [...leads].sort((a, b) => (a.id === leadId ? -1 : b.id === leadId ? 1 : 0))
    : leads;

  // Fetch pipeline stages for the CreateDeal modal
  const stages = await db.pipelineStage.findMany({ orderBy: { order: "asc" } });

  return (
    <CockpitDb
      leads={ordered}
      userId={user.id}
      stages={stages}
      listId={listId ?? null}
      listName={listName}
    />
  );
}
