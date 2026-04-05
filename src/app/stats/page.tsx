import { getDailyStats, getConversionRates, getFluffStats, getPipelineOverview } from "@/app/actions/stats";
import { StatsView } from "@/components/stats/StatsView";

export default async function StatsPage() {
  const [daily, conversion, fluff, pipeline] = await Promise.all([
    getDailyStats(30),
    getConversionRates(),
    getFluffStats(7),
    getPipelineOverview(),
  ]);

  return <StatsView daily={daily} conversion={conversion} fluff={fluff} pipeline={pipeline} />;
}
