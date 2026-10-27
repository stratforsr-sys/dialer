import { notFound } from "next/navigation";
import { getLead } from "@/app/actions/leads";
import { getShareTargets } from "@/app/actions/lists";
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
  // Ligger bolaget i säljarens egen mapp kan det delas härifrån. Listorna
  // hämtas bara då — för alla andra bolag finns inget val att göra.
  const inMyList = lead.lists[0]?.list.personalForId === user.id;
  const shareTargets = inMyList ? await getShareTargets() : null;
  return <LeadDetail lead={lead} isAdmin={user.role === "ADMIN"} shareTargets={shareTargets} />;
}
