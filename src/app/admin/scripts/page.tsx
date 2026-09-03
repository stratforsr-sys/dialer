import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getScripts, getAvailableClaimKeys, getListsForScripts } from "@/app/actions/scripts";
import { ScriptsView } from "@/components/scripts/ScriptsView";

export const dynamic = "force-dynamic";

/**
 * Ett riktigt lead att förhandsgranska mot. Helst ett med underlag — då ser man
 * om varianterna faktiskt faller ut som tänkt. Manus knutna till en mapp
 * granskas mot ett bolag ur den mappen i stället; vyn hämtar det när manuset
 * väljs.
 *
 * Reservträffen låg tidigare i ett `??` mellan två `findFirst`. Vänsterledet är
 * ett Promise och alltså alltid sant, så högerledet kördes aldrig: fanns inget
 * lead med dossier blev förhandsgranskningen tyst utan exempelbolag i stället
 * för att falla tillbaka på ett godtyckligt.
 */
async function sampleLead() {
  const withDossier = await db.lead.findFirst({
    where: { dossier: { isNot: null } },
    select: { id: true, companyName: true },
  });
  if (withDossier) return withDossier;
  return db.lead.findFirst({ select: { id: true, companyName: true } });
}

export default async function ScriptsPage() {
  await requireAdmin();

  const [templates, lists, claimKeys, sample] = await Promise.all([
    getScripts(),
    getListsForScripts(),
    getAvailableClaimKeys(),
    sampleLead(),
  ]);

  return (
    // ScriptsView läser markeringen ur URL:en med useSearchParams, och den
    // kräver en Suspense-gräns för att bygget inte ska klaga.
    <Suspense fallback={null}>
      <ScriptsView
        templates={templates}
        lists={lists}
        claimKeys={claimKeys}
        sampleLeadId={sample?.id ?? null}
        sampleLeadName={sample?.companyName ?? null}
      />
    </Suspense>
  );
}
