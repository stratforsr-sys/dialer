import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CallbacksClient } from "@/components/callbacks/CallbacksClient";

export default async function CallbacksPage() {
  const user = await requireAuth();

  const callbacks = await db.callback.findMany({
    where: {
      completedAt: null,
      ...(user.role === "SELLER" ? { userId: user.id } : {}),
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const past = callbacks.filter((c) => new Date(c.scheduledAt) < new Date());
  const upcoming = callbacks.filter((c) => new Date(c.scheduledAt) >= new Date());

  return <CallbacksClient past={past} upcoming={upcoming} isAdmin={user.role === "ADMIN"} />;
}
