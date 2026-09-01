import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getDeal } from "@/app/actions/deals";
import { DealDetail } from "@/components/deals/DealDetail";

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, data] = await Promise.all([requireAuth(), getDeal(id)]);
  if (!data) notFound();
  // Knapparna för att rätta, ångra och radera visas bara för admin. Grinden
  // ligger i server actionen — det här är bara att slippa visa en knapp som
  // ändå säger nej.
  return <DealDetail data={data} isAdmin={user.role === "ADMIN"} />;
}
