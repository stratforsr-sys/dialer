import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CockpitDb } from "@/components/CockpitDb";
import {
  leaseNextLeads,
  leaseSpecificLead,
  getDialerConfig,
  getCallSlots,
} from "@/app/actions/dialer";
import { canAccessList } from "@/lib/lists";
import { redirect } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ listId?: string; leadId?: string }>;
}) {
  const { listId, leadId } = await searchParams;
  const user = await requireAuth();

  // ── Uppslaget bolag: sökningen pekade ut ett företag ────────────────────
  // Det bolaget avgör allt annat — vilken mapp cockpiten kör i och vad som
  // ligger först i kön. Leasen tas här och inte i klienten: hinner en kollega
  // före ska säljaren mötas av ett besked, inte av ett bolag som tyst byttes ut.
  if (leadId) {
    const opened = await leaseSpecificLead(leadId);

    if (!opened.ok) {
      return <Blocked message={opened.message} leadId={leadId} />;
    }

    // Mappen i länken vinner om bolaget faktiskt ligger där — kommer man från
    // en ringlista ska man hamna tillbaka i den, inte i bolagets första mapp.
    const wanted = listId && (await canAccessList(user, listId)) ? listId : null;
    const effectiveListId = wanted ?? opened.listId;

    const [list, rest, config, slots] = await Promise.all([
      effectiveListId
        ? db.callList.findUnique({ where: { id: effectiveListId }, select: { name: true } })
        : Promise.resolve(null),
      leaseNextLeads(effectiveListId),
      getDialerConfig(),
      getCallSlots(),
    ]);

    // Bolaget ligger först, resten av däcket efter: samtalet man sökte upp tas
    // nu, och sedan rullar passet vidare som vanligt.
    const leads = [opened.lead, ...rest.filter((l) => l.id !== opened.lead.id)];

    return (
      <CockpitDb
        initialLeads={leads}
        userId={user.id}
        listId={effectiveListId}
        listName={list?.name ?? opened.listName}
        leaseMinutes={config.leaseMinutes}
        slots={slots}
        openedLeadId={opened.lead.id}
        openedWarnings={opened.warnings}
      />
    );
  }

  // ── Vanlig ingång: en ringlista ────────────────────────────────────────
  // Utan listId finns ingen kö att ringa.
  if (!listId) redirect("/lists");

  // Åtkomstkontroll före allt annat — samma svar oavsett om mappen inte finns
  // eller om användaren saknar behörighet, så existensen inte avslöjas.
  const [allowed, list] = await Promise.all([
    canAccessList(user, listId),
    db.callList.findUnique({ where: { id: listId }, select: { name: true } }),
  ]);
  if (!allowed || !list) redirect("/lists");

  // Leasen ersätter den gamla findMany som skickade samma 200 leads i samma
  // ordning till varje säljare. Nu får varje säljare ett eget, reserverat
  // block — två personer kan aldrig få samma bolag.
  const [leads, config, slots] = await Promise.all([
    leaseNextLeads(listId),
    getDialerConfig(),
    getCallSlots(),
  ]);

  return (
    <CockpitDb
      initialLeads={leads}
      userId={user.id}
      listId={listId}
      listName={list.name}
      leaseMinutes={config.leaseMinutes}
      slots={slots}
    />
  );
}

/**
 * Enda vägen hit är att en kollega har bolaget uppe just nu. Skärmen säger vem
 * och hur länge — ett "gick inte" utan namn hade bara gett en ny sökning på
 * samma bolag en halv minut senare.
 */
function Blocked({ message, leadId }: { message: string; leadId: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--bg)" }}>
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
      >
        <Lock size={26} style={{ color: "var(--warning)" }} />
      </div>
      <h2 className="text-[20px] font-semibold text-center max-w-[420px]" style={{ color: "var(--text)" }}>
        {message}
      </h2>
      <p className="text-[14px] text-center max-w-[380px]" style={{ color: "var(--text-muted)" }}>
        Reservationen släpps när kollegan dispositionerat samtalet eller lämnat cockpiten.
      </p>
      <div className="flex items-center gap-2 mt-2">
        <Link
          href={`/leads/${leadId}`}
          className="px-5 py-2 text-[13px] font-medium rounded-md"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Öppna bolagskortet
        </Link>
        <Link
          href="/lists"
          className="flex items-center gap-1 px-4 py-2 text-[13px] rounded-md"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          <ArrowLeft size={13} /> Ringlistor
        </Link>
      </div>
    </div>
  );
}
