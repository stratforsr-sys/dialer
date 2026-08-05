import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getAssignableUsers } from "@/app/actions/lists";
import { DbImportView } from "@/components/DbImportView";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requireAuth();
  // Endast admin laddar upp listor och bestämmer vem som ska jobba på dem
  if (user.role !== "ADMIN") redirect("/lists");

  const users = await getAssignableUsers();

  return <DbImportView users={users} />;
}
