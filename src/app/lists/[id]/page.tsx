import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getList, getAssignableUsers } from "@/app/actions/lists";
import { ListDetailView } from "@/components/lists/ListDetailView";

export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";

  const [list, users] = await Promise.all([
    getList(id),
    isAdmin ? getAssignableUsers() : Promise.resolve([]),
  ]);

  // getList returnerar null både när mappen saknas och när användaren
  // saknar åtkomst — läcker inte att mappen existerar.
  if (!list) notFound();

  return <ListDetailView list={list} users={users} isAdmin={isAdmin} viewerId={user.id} />;
}
