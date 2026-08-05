import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSupplyForecast } from "@/app/actions/dialer-settings";
import { DialerSettingsView } from "@/components/admin/DialerSettingsView";

export const dynamic = "force-dynamic";

export default async function DialerSettingsPage() {
  await requireAdmin();

  const [config, slots, forecast] = await Promise.all([
    db.dialerConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    }),
    db.callSlot.findMany({ orderBy: { order: "asc" } }),
    getSupplyForecast(),
  ]);

  return <DialerSettingsView config={config} slots={slots} forecast={forecast} />;
}
