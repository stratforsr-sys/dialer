import {
  getDailyStats,
  getConversionRates,
  getFluffStats,
  getDealsOverview,
  getSellerStats,
  getStatsLists,
} from "@/app/actions/stats";
import { requireAuth } from "@/lib/auth";
import { StatsView } from "@/components/stats/StatsView";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string; lista?: string }>;
}) {
  const { seller, lista } = await searchParams;
  const user = await requireAuth();

  // Parametern skickas vidare rå. statsScope i actions/stats.ts avgör om den
  // får verkan — för en säljare ignoreras den, så en handskriven länk till
  // ?seller=<någon annan> ger fortfarande bara de egna siffrorna.
  const isAdmin = user.role === "ADMIN";
  const sellerFilter = isAdmin && seller ? seller : null;

  // `lista` däremot gäller ALLA roller: en säljare ska kunna se hur det går i
  // sin egen mapp. Skyddet ligger i stället i `getStatsLists`, som bara
  // returnerar mappar användaren har tillgång till — och i att siffrorna ändå
  // är begränsade till den egna säljaren av `statsScope`. Ett id till en mapp
  // man saknar åtkomst till ger därmed noll rader, inte någon annans data.
  const [daily, conversion, fluff, deals, sellers, listor] = await Promise.all([
    getDailyStats(30, seller, lista),
    getConversionRates(seller, lista),
    getFluffStats(30, seller),
    getDealsOverview(seller, 90, lista),
    getSellerStats(30, lista),
    getStatsLists(),
  ]);

  const listFilter = lista && listor.some((l) => l.id === lista) ? lista : null;

  return (
    <StatsView
      daily={daily}
      conversion={conversion}
      fluff={fluff}
      deals={deals}
      sellers={sellers}
      isAdmin={isAdmin}
      sellerFilter={sellerFilter}
      lists={listor}
      listFilter={listFilter}
    />
  );
}
