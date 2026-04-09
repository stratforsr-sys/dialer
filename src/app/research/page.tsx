import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ResearchPageClient } from "@/components/research/ResearchPageClient";

export default async function ResearchPage() {
  const user = await requireAuth();

  const leads = await db.lead.findMany({
    where: user.role === "SELLER" ? { ownerId: user.id } : {},
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyName: true,
      orgNumber: true,
      website: true,
      contacts: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { name: true, role: true, directPhone: true, email: true },
      },
    },
    take: 500,
  });

  return <ResearchPageClient leads={leads} />;
}
