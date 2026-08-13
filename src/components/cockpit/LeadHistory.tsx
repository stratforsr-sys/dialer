"use client";

import { useMemo, useState } from "react";
import { ChevronRight, StickyNote, History } from "lucide-react";
import { RESULT_OPTIONS, OUTCOME_OPTIONS, REASON_OPTIONS } from "@/lib/cockpit-flow";
import { formatWhen } from "@/lib/time";
import { mergeCockpitNotes } from "@/lib/history-merge";
import type { CallResult, ConversationOutcome, NoReason } from "@/generated/prisma/client";

/**
 * Vad som hänt med leadet tidigare.
 *
 * Före det här fanns ingenting: cockpit-anteckningen sparades på `CallAttempt`
 * och renderades inte på ett enda ställe i appen. Skrev en säljare "vill ha
 * offert efter semestern" var den informationen borta för den som ringde
 * nästa gång.
 *
 * Formen är vald för att kosta så lite skärm som möjligt. Varje rad är EN rad:
 * tidpunkt och utfall, inget mer. Anteckningen fälls ut först när man klickar
 * på raden. En säljare mitt i ett samtal behöver veta *att* det finns något att
 * läsa och var — inte läsa allt i förväg. Rader utan anteckning går inte att
 * fälla ut och saknar pil, så man ser på en tiondels sekund vilka som bär text.
 *
 * Två källor i samma tidslinje: samtal (`CallAttempt`) och anteckningar
 * skrivna på lead-sidan (`Activity` med typ `NOTE`). Säljaren bryr sig om vad
 * som sagts om bolaget, inte om i vilken vy det skrevs.
 *
 * ## Anteckningar som fälls ihop med sitt utfall
 *
 * En anteckning skriven i cockpiten med Enter sparas direkt och dyker upp som
 * en egen rad — säljaren ska se att den tog. Sätter hen sedan ett utfall på
 * samtalet **försvinner den egna raden och texten flyttar in under utfallet**.
 * Kvar står en rad: "Sa nej · Pris", med anteckningen en klickning bort.
 *
 * Sammanslagningen sker vid läsning, inte vid skrivning. Ingenting muteras och
 * ingen rad tas bort — aktivitetsloggen är oföränderlig. Kopplingen är
 * `sessionId`: en cockpit-anteckning hör till det första samtal som skrivs
 * **efter** den, **i samma ringpass**. Utan den kopplingen hade en anteckning
 * som lämnats utan utfall sugits in i nästa samtal på bolaget, vilket kunde
 * ligga dagar bort och tillhöra någon annan.
 *
 * Finns inget sådant samtal ligger anteckningen kvar som egen rad, för alltid.
 * Skrev någon ned något är det värt att behålla.
 */

export interface HistoryAttempt {
  id: string;
  startedAt: Date | string;
  result: CallResult;
  outcome: ConversationOutcome | null;
  noReason: NoReason | null;
  note: string | null;
  /** Vilket ringpass samtalet gjordes i. Kopplingen som fäller ihop en
   *  cockpit-anteckning med sitt utfall. Null för äldre rader — de får
   *  aldrig svälja någon anteckning. */
  sessionId?: string | null;
  seller: { name: string };
}

export interface HistoryActivity {
  id: string;
  timestamp: Date | string;
  metadata: string | null;
  actor: { name: string };
}

interface Entry {
  id: string;
  at: Date;
  label: string;
  color: string;
  note: string | null;
  who: string;
}

function labelFor(
  result: CallResult,
  outcome: ConversationOutcome | null,
  noReason: NoReason | null
): { label: string; color: string } {
  const r = RESULT_OPTIONS.find((o) => o.value === result);
  const o = outcome ? OUTCOME_OPTIONS.find((x) => x.value === outcome) : undefined;
  const n = noReason ? REASON_OPTIONS.find((x) => x.value === noReason) : undefined;

  // Mest specifika etiketten vinner: "Sa nej · Pris" säger mer än "Nådde
  // beslutsfattaren", och det är det man vill veta innan man ringer igen.
  if (o && n) return { label: `${o.label} · ${n.label}`, color: o.color };
  if (o) return { label: o.label, color: o.color };
  return { label: r?.label ?? result, color: r?.color ?? "var(--text-muted)" };
}

export function LeadHistory({
  attempts,
  activities,
}: {
  attempts: HistoryAttempt[];
  activities: HistoryActivity[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    // Regeln för vad som fälls ihop med vad ligger i history-merge.ts och
    // testas av scripts/test-history-merge.ts. Här stannar bara etiketterna.
    const { noteForAttempt, standalone } = mergeCockpitNotes(
      attempts.map((a) => ({
        id: a.id,
        at: new Date(a.startedAt),
        sessionId: a.sessionId ?? null,
        note: a.note,
      })),
      activities.map((act) => ({
        id: act.id,
        at: new Date(act.timestamp),
        metadata: act.metadata,
        who: act.actor.name,
      }))
    );

    const out: Entry[] = attempts.map((a) => {
      const { label, color } = labelFor(a.result, a.outcome, a.noReason);
      return {
        id: a.id,
        at: new Date(a.startedAt),
        label,
        color,
        note: noteForAttempt.get(a.id) ?? null,
        who: a.seller.name,
      };
    });

    for (const n of standalone) {
      out.push({
        id: n.id,
        at: n.at,
        label: "Anteckning",
        color: "var(--info)",
        note: n.note,
        who: n.who,
      });
    }

    return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 10);
  }, [attempts, activities]);

  // Ny kontakt utan historik ska inte få en tom ruta som stjäl plats.
  if (entries.length === 0) return null;

  const withNotes = entries.filter((e) => e.note).length;

  return (
    <div
      className="rounded-lg overflow-hidden mb-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-[7px]"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <History size={11} style={{ color: "var(--text-dim)" }} />
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          Historik
        </span>
        <span className="text-[10px] ml-auto" style={{ color: "var(--text-dim)" }}>
          {entries.length} {entries.length === 1 ? "händelse" : "händelser"}
          {withNotes > 0 && ` · ${withNotes} med anteckning`}
        </span>
      </div>

      {entries.map((e) => {
        const open = openId === e.id;
        const hasNote = Boolean(e.note);

        return (
          <div key={e.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => hasNote && setOpenId(open ? null : e.id)}
              className="flex items-center gap-2 w-full px-4 py-[6px] text-left"
              style={{ cursor: hasNote ? "pointer" : "default" }}
              onMouseEnter={(ev) => {
                if (hasNote) ev.currentTarget.style.background = "var(--surface-hover)";
              }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.background = "transparent";
              }}
              title={hasNote ? "Visa anteckningen" : "Ingen anteckning på det här samtalet"}
            >
              <span
                className="text-[11px] mono-nums shrink-0"
                style={{ color: "var(--text-dim)", minWidth: 86 }}
              >
                {formatWhen(e.at)}
              </span>

              <span
                className="text-[11px] font-medium truncate"
                style={{ color: e.color }}
              >
                {e.label}
              </span>

              {hasNote && (
                <>
                  <StickyNote size={10} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                  <ChevronRight
                    size={11}
                    className="ml-auto shrink-0"
                    style={{
                      color: "var(--text-dim)",
                      transform: open ? "rotate(90deg)" : "none",
                      transition: "transform 0.14s var(--ease-out-expo)",
                    }}
                  />
                </>
              )}
            </button>

            {open && e.note && (
              <div
                className="px-4 pb-[10px] pt-[2px]"
                style={{ background: "var(--surface-inset)" }}
              >
                {/* whitespace-pre-wrap: anteckningar skrivs med radbrytningar
                    och HTML klämmer annars ihop dem till en mening. */}
                <p
                  className="text-[12px] whitespace-pre-wrap"
                  style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}
                >
                  {e.note}
                </p>
                <p className="text-[10px] mt-[4px]" style={{ color: "var(--text-dim)" }}>
                  {e.who}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
