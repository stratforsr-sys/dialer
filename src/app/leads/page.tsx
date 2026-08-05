import { getLeads, countLeads } from "@/app/actions/leads";
import { LEADS_PAGE_SIZE } from "@/lib/constants";
import { db } from "@/lib/db";
import { LeadsTable } from "@/components/leads/LeadsTable";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;

  // Alla tre är oberoende — en round-trip i stället för tre i sekvens
  const [leads, stages, total] = await Promise.all([
    getLeads({ search: params.search }), // hasActiveDeal=false by default
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    countLeads({ search: params.search }),
  ]);

  return (
    <div className="h-full flex flex-col">
      <LeadsTable
        leads={leads}
        stages={stages}
        total={total}
        pageSize={LEADS_PAGE_SIZE}
      />
    </div>
  );
}
