import { prisma } from "@/lib/prisma";
import { getDueRepetitions, getWeakestTechniques } from "@/lib/knowledge-base";
import { getDashboardStats } from "@/actions/gamification";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

const USER_ID = "default-user";

export default async function DashboardPage() {
  const [stats, dueReps, weakTechniques, modules] = await Promise.all([
    getDashboardStats(USER_ID),
    getDueRepetitions(USER_ID),
    getWeakestTechniques(USER_ID, 5),
    prisma.module.findMany({
      where: { userId: USER_ID },
      include: {
        techniques: {
          include: { skillProgress: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <DashboardClient
      stats={stats}
      dueReps={dueReps}
      weakTechniques={weakTechniques}
      modules={modules as any}
    />
  );
}
