import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";

export default async function CockpitPage() {
  const user = await requireAuth();

  // Load leads that have contacts, owned by this seller (or all for admin)
  const leads = await db.lead.findMany({
    where: {
      ...(user.role === "SELLER" ? { ownerId: user.id } : {}),
      contacts: { some: {} },
      stage: { isLost: false, isWon: false },
    },
    orderBy: { updatedAt: "asc" },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      stage: { select: { id: true, name: true, color: true } },
      activities: {
        where: { type: { in: ["CALL", "CALL_NO_ANSWER"] } },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true },
      },
    },
  });

  return <CockpitDb leads={leads} userId={user.id} />;
}
