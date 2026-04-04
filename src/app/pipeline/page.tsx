import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";

export default async function PipelinePage() {
  const user = await requireAuth();

  const [stages, leads] = await Promise.all([
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    db.lead.findMany({
      where: user.role === "SELLER" ? { ownerId: user.id } : {},
      orderBy: { updatedAt: "desc" },
      include: {
        stage: true,
        owner: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
        activities: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { type: true, timestamp: true },
        },
      },
    }),
  ]);

  return <KanbanBoard initialStages={stages} initialLeads={leads} />;
}
