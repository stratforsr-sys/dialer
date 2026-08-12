"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Phone, CalendarClock, Ban, Briefcase } from "lucide-react";
import { searchAssignedLeads, type LeadSearchHit } from "@/app/actions/leads";
import { formatSwedish } from "@/lib/phone";
import { formatWhen } from "@/lib/time";

/**
 * Leadträffar under sökfältet på Ringlistor.
 *
 * Sökfältet filtrerade tidigare bara mappnamn. Nu när lead-listan är borta ur
 * menyn är det här enda vägen in till ett enskilt bolag, och fältet måste
 * kunna svara på "var ligger Kålltorps Hundställe?" lika bra som på "vilken
 * mapp hette Göteborg?".
 *
 * Mapparna filtreras fortfarande direkt i klienten — de är redan hämtade och
 * ett par dussin till antalet. Leads går mot servern, med fördröjning: en
 * fråga per tangenttryckning mot flera tusen rader är ren belastning för ett
 * resultat som ändå hinner bytas ut innan någon läst det.
 */

/** Väntetid efter sista tangenttryckningen. Under 200 ms känns det som en
 *  fråga per bokstav; över 400 ms känns fältet trögt. */
const DEBOUNCE_MS = 250;

export function LeadSearchResults({ query }: { query: string }) {
  const router = useRouter();
  const [hits, setHits] = useState<LeadSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const t = setTimeout(() => {
      searchAssignedLeads(q)
        .then((res) => {
          // Ett svar på en gammal sökning får aldrig skriva över ett nyare.
          // Utan flaggan blinkar listan tillbaka till förra bokstavens träffar
          // så fort nätet är ojämnt.
          if (cancelled) return;
          setHits(res);
          setSearched(true);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      setLoading(false);
      window.clearTimeout(t);
    };
  }, [query]);

  if (query.trim().length < 2) return null;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-[7px]"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          Leads
        </span>
        {loading && <Loader2 size={11} className="animate-spin" style={{ color: "var(--text-dim)" }} />}
        {!loading && searched && (
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {hits.length === 12 ? "12+ träffar — skriv mer" : `${hits.length} träffar`}
          </span>
        )}
      </div>

      {!loading && searched && hits.length === 0 && (
        <p className="px-4 py-3 text-[12px]" style={{ color: "var(--text-dim)" }}>
          Inget lead matchar. Sök på bolagsnamn, kontaktperson, ort, org.nr eller telefonnummer.
        </p>
      )}

      {hits.map((hit) => (
        <button
          key={hit.id}
          onClick={() => router.push(`/leads/${hit.id}`)}
          className="flex items-center gap-3 w-full px-4 py-[9px] text-left"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Building2 size={13} className="shrink-0" style={{ color: "var(--text-dim)" }} />

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span
                className="text-[13px] font-medium truncate"
                style={{ color: "var(--text)" }}
              >
                {hit.companyName}
              </span>

              {hit.retired && (
                <Tag icon={<Ban size={9} />} color="var(--danger)" label={hit.retiredReason ?? "Spärrat"} />
              )}
              {hit.hasActiveDeal && (
                <Tag icon={<Briefcase size={9} />} color="var(--success)" label="Affär" />
              )}
              {hit.callbackAt && !hit.retired && (
                <Tag
                  icon={<CalendarClock size={9} />}
                  color="var(--accent)"
                  label={formatWhen(new Date(hit.callbackAt))}
                />
              )}
            </span>

            <span className="flex items-center gap-2 text-[11px] mt-[1px]" style={{ color: "var(--text-muted)" }}>
              {hit.contactName && <span className="truncate">{hit.contactName}</span>}
              {hit.city && <span className="truncate">{hit.city}</span>}
              {hit.listName && <span className="truncate">· {hit.listName}</span>}
            </span>
          </span>

          {hit.phone && (
            <span
              className="flex items-center gap-1 text-[11px] shrink-0 mono-nums"
              style={{ color: "var(--text-muted)" }}
            >
              <Phone size={10} />
              {formatSwedish(hit.phone)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Tag({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-[5px] py-[1px] rounded-sm text-[10px] font-medium shrink-0 whitespace-nowrap"
      style={{ color, background: "var(--surface-inset)" }}
    >
      {icon}
      {label}
    </span>
  );
}
