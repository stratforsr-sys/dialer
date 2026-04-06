import { notFound } from "next/navigation";
import { getLead } from "@/app/actions/leads";
import { LeadDetail } from "@/components/leads/LeadDetail";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  return <LeadDetail lead={lead} />;
}
