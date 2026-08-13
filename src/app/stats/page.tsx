import { getDailyStats, getConversionRates, getFluffStats, getDealsOverview, getSellerStats } from "@/app/actions/stats";
import { requireAuth } from "@/lib/auth";
import { StatsView } from "@/components/stats/StatsView";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string }>;
}) {
  const { seller } = await searchParams;
  const user = await requireAuth();

  // Parametern skickas vidare rå. statsScope i actions/stats.ts avgör om den
  // får verkan — för en säljare ignoreras den, så en handskriven länk till
  // ?seller=<någon annan> ger fortfarande bara de egna siffrorna.
  const isAdmin = user.role === "ADMIN";
  const sellerFilter = isAdmin && seller ? seller : null;

  const [daily, conversion, fluff, deals, sellers] = await Promise.all([
    getDailyStats(30, seller),
    getConversionRates(seller),
    getFluffStats(30, seller),
    getDealsOverview(seller),
    getSellerStats(30),
  ]);

  return (
    <StatsView
      daily={daily}
      conversion={conversion}
      fluff={fluff}
      deals={deals}
      sellers={sellers}
      isAdmin={isAdmin}
      sellerFilter={sellerFilter}
    />
  );
}
