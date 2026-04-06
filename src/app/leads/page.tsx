import { getLeads } from "@/app/actions/leads";
import { db } from "@/lib/db";
import { LeadsTable } from "@/components/leads/LeadsTable";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;
  const [leads, stages] = await Promise.all([
    getLeads({ search: params.search }), // hasActiveDeal=false by default
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <div className="h-full flex flex-col">
      <LeadsTable leads={leads} stages={stages} />
    </div>
  );
}
