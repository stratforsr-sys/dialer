import { getDailyStats, getConversionRates, getFluffStats, getPipelineOverview, getSellerStats } from "@/app/actions/stats";
import { requireAuth } from "@/lib/auth";
import { StatsView } from "@/components/stats/StatsView";

export default async function StatsPage() {
  const user = await requireAuth();

  const [daily, conversion, fluff, pipeline, sellers] = await Promise.all([
    getDailyStats(30),
    getConversionRates(),
    getFluffStats(30),
    getPipelineOverview(),
    getSellerStats(30),
  ]);

  return (
    <StatsView
      daily={daily}
      conversion={conversion}
      fluff={fluff}
      pipeline={pipeline}
      sellers={sellers}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
