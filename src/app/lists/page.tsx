import { requireAuth } from "@/lib/auth";
import { getLists, getAssignableUsers } from "@/app/actions/lists";
import { ListsBoard } from "@/components/lists/ListsBoard";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";

  const [lists, users] = await Promise.all([
    getLists(),
    isAdmin ? getAssignableUsers() : Promise.resolve([]),
  ]);

  return <ListsBoard lists={lists} users={users} isAdmin={isAdmin} />;
}
