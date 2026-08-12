"use client";

import { useMemo, useState } from "react";
import { ChevronRight, StickyNote, History } from "lucide-react";
import { RESULT_OPTIONS, OUTCOME_OPTIONS, REASON_OPTIONS } from "@/lib/cockpit-flow";
import { formatWhen } from "@/lib/time";
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
 */

export interface HistoryAttempt {
  id: string;
  startedAt: Date | string;
  result: CallResult;
  outcome: ConversationOutcome | null;
  noReason: NoReason | null;
  note: string | null;
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

/** Anteckningstexten ur en Activity. Trasig JSON tystas — loggen får aldrig
 *  fälla cockpiten. */
function noteFromMetadata(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { note?: string; notes?: string };
    return parsed.note ?? parsed.notes ?? null;
  } catch {
    return null;
  }
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
    const out: Entry[] = attempts.map((a) => {
      const { label, color } = labelFor(a.result, a.outcome, a.noReason);
      return {
        id: a.id,
        at: new Date(a.startedAt),
        label,
        color,
        note: a.note,
        who: a.seller.name,
      };
    });

    for (const act of activities) {
      const note = noteFromMetadata(act.metadata);
      if (!note) continue;
      out.push({
        id: act.id,
        at: new Date(act.timestamp),
        label: "Anteckning",
        color: "var(--info)",
        note,
        who: act.actor.name,
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
