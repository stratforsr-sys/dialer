import { notFound } from "next/navigation";
import { getDeal } from "@/app/actions/deals";
import { DealDetail } from "@/components/deals/DealDetail";

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDeal(id);
  if (!data) notFound();
  return <DealDetail data={data} />;
}
