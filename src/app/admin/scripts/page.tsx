import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getScripts, getAvailableClaimKeys } from "@/app/actions/scripts";
import { ScriptsView } from "@/components/scripts/ScriptsView";

export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  await requireAdmin();

  const [templates, claimKeys, sample] = await Promise.all([
    getScripts(),
    getAvailableClaimKeys(),
    // Ett riktigt lead att förhandsgranska mot. Helst ett med underlag — då
    // ser man om varianterna faktiskt faller ut som tänkt.
    db.lead.findFirst({
      where: { dossier: { isNot: null } },
      select: { id: true, companyName: true },
    }) ??
      db.lead.findFirst({ select: { id: true, companyName: true } }),
  ]);

  return (
    <ScriptsView
      templates={templates}
      claimKeys={claimKeys}
      sampleLeadId={sample?.id ?? null}
      sampleLeadName={sample?.companyName ?? null}
    />
  );
}
