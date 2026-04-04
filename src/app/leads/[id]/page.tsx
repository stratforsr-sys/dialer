import { notFound } from "next/navigation";
import { getLead } from "@/app/actions/leads";
import { getStages } from "@/app/actions/pipeline";
import { LeadDetail } from "@/components/leads/LeadDetail";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lead, stages] = await Promise.all([getLead(id), getStages()]);
  if (!lead) notFound();
  return <LeadDetail lead={lead} stages={stages} />;
}
