import { requireAdmin } from "@/lib/auth";
import { getFloor } from "@/app/actions/presence";
import { FloorView } from "@/components/admin/FloorView";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  await requireAdmin();
  const initial = await getFloor();
  return <FloorView initial={initial} />;
}
