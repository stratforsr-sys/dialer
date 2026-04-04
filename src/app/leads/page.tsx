import { getLeads } from "@/app/actions/leads";
import { getStages } from "@/app/actions/pipeline";
import { LeadsTable } from "@/components/leads/LeadsTable";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stageId?: string }>;
}) {
  const params = await searchParams;
  const [leads, stages] = await Promise.all([
    getLeads({ search: params.search, stageId: params.stageId }),
    getStages(),
  ]);

  return (
    <div className="h-full flex flex-col">
      <LeadsTable leads={leads} stages={stages} />
    </div>
  );
}
