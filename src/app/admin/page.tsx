import { db } from "@/lib/db";
import { AdminView } from "@/components/AdminView";

export default async function AdminPage() {
  const [users, stages, products] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, createdAt: true } }),
    db.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    db.product.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <AdminView users={users} stages={stages} products={products} />;
}
