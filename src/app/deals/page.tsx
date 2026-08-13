import { requireAuth } from "@/lib/auth";
import { getDeals } from "@/app/actions/deals";
import { DealsView } from "@/components/deals/DealsView";

export default async function DealsPage() {
  const [user, deals] = await Promise.all([requireAuth(), getDeals()]);
  return <DealsView deals={deals} isAdmin={user.role === "ADMIN"} />;
}
