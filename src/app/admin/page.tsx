import { db } from "@/lib/db";
import { AdminView } from "@/components/AdminView";
import { SYSTEM_USER_EMAIL } from "@/lib/system-user";

export default async function AdminPage() {
  const [users, products] = await Promise.all([
    // Gravstenskontot hålls utanför: det går varken att radera eller ge en
    // roll, och en rad man bara kan bli nekad av hör inte hemma i listan.
    // Historiken det bär syns i statistiken, som är där den betyder något.
    db.user.findMany({
      where: { email: { not: SYSTEM_USER_EMAIL } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    db.product.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <AdminView users={users} products={products} />;
}
