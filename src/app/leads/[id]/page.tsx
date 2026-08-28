import { notFound } from "next/navigation";
import { getLead } from "@/app/actions/leads";
import { requireAuth } from "@/lib/auth";
import { LeadDetail } from "@/components/leads/LeadDetail";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, lead] = await Promise.all([requireAuth(), getLead(id)]);
  if (!lead) notFound();
  return <LeadDetail lead={lead} isAdmin={user.role === "ADMIN"} />;
}
