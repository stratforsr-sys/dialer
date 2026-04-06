import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";

export default async function CockpitPage() {
  const user = await requireAuth();

  const leads = await db.lead.findMany({
    where: {
      ...(user.role === "SELLER" ? { ownerId: user.id } : {}),
      contacts: { some: {} },
      hasActiveDeal: false, // leads with active deals live in pipeline now
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

  // Fetch pipeline stages for the CreateDeal modal
  const stages = await db.pipelineStage.findMany({ orderBy: { order: "asc" } });

  return <CockpitDb leads={leads} userId={user.id} stages={stages} />;
}
