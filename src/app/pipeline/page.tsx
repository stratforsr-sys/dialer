import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PipelineView } from "@/components/pipeline/PipelineView";

export default async function PipelinePage() {
  await requireAuth();

  const [stages, deals] = await Promise.all([
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    db.deal.findMany({
      where: { status: "OPEN" },
      orderBy: { updatedAt: "desc" },
      include: {
        stage: true,
        lead: {
          select: {
            id: true,
            companyName: true,
            website: true,
            owner: { select: { id: true, name: true } },
          },
        },
        products: { select: { id: true, name: true } },
      },
    }),
  ]);

  return <PipelineView stages={stages} deals={deals} />;
}
