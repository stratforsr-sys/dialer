"use client";

import { useEffect, useMemo, useRef } from "react";
import { CalendarClock, Mail, AlertTriangle } from "lucide-react";
import { toDatetimeLocalValue, formatWhen } from "@/lib/time";

/**
 * Bokningsrutan för en återkomst.
 *
 * Den gamla rutan var ett ensamt `datetime-local` och en Spara-knapp. Tre
 * saker saknades, och alla tre kostade samtal:
 *
 * **Snabbval.** "Ring mig efter lunch" blev fjorton tangenttryckningar i ett
 * datumfält medan kunden väntade i luren. Fyra knappar täcker det säljaren
 * faktiskt lovar; fältet finns kvar för allt annat.
 *
 * **Anteckningen.** Utan den vet man om tre dagar att man lovat ringa, men
 * inte varför. Den följer med in i notisen och i påminnelsemejlet.
 *
 * **Ingen validering.** Ett fält som defaultar till tomt och accepterar
 * gårdagens datum ger tysta återkomster som förfaller i samma sekund de
 * skapas. Nu krävs en tidpunkt i framtiden.
 *
 * Kryssrutan för mejl är URBOCKAD som förval med flit. Ett mejl som kommer på
 * varenda bokning slutar läsas inom en vecka; krysset ska betyda "den här får
 * jag inte missa".
 */

export interface CallbackDraft {
  at: string;
  note: string;
  emailReminder: boolean;
}

export const EMPTY_CALLBACK: CallbackDraft = {
  at: "",
  note: "",
  emailReminder: false,
};

/** Snabbval. Håll dem få — fler knappar är inte snabbare, bara mer att läsa. */
function presets(now: Date): Array<{ label: string; at: Date }> {
  const inOneHour = new Date(now.getTime() + 3600_000);

  function nextDayAt(days: number, hour: number, minute = 0): Date {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  // Hoppa över helgen: "imorgon" på en fredag betyder måndag för alla utom
  // kalendern. En återkomst på en lördag ringer ingen.
  function nextWeekdayAt(hour: number): Date {
    let days = 1;
    for (let i = 0; i < 7; i++) {
      const d = nextDayAt(days, hour);
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) return d;
      days++;
    }
    return nextDayAt(1, hour);
  }

  const tomorrowMorning = nextWeekdayAt(9);
  const tomorrowAfternoon = nextWeekdayAt(13);
  const isTomorrow = tomorrowMorning.getDate() === new Date(now.getTime() + 86_400_000).getDate();
  const dayWord = isTomorrow ? "Imorgon" : "Nästa vardag";

  return [
    { label: "Om 1 tim", at: inOneHour },
    { label: `${dayWord} 09:00`, at: tomorrowMorning },
    { label: `${dayWord} 13:00`, at: tomorrowAfternoon },
    { label: "Om 3 dagar", at: nextDayAt(3, 10) },
  ];
}

export function CallbackForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: CallbackDraft;
  onChange: (next: CallbackDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const noteRef = useRef<HTMLInputElement>(null);

  // Presets beräknas en gång per öppning. Skulle de räknas om varje rendering
  // skulle "om 1 tim" glida framåt medan säljaren skriver anteckningen.
  const quick = useMemo(() => presets(new Date()), []);

  const chosen = draft.at ? new Date(draft.at) : null;
  const valid = chosen !== null && !Number.isNaN(chosen.getTime()) && chosen.getTime() > Date.now();
  const inPast = chosen !== null && !Number.isNaN(chosen.getTime()) && chosen.getTime() <= Date.now();

  // Enter sparar från vilket fält som helst i rutan, Escape backar. Cockpitens
  // globala tangentlyssnare släpper igenom fält, så det måste ske här.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && valid) {
      e.preventDefault();
      onSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  // Fokus i anteckningen först när tiden är vald — annars står markören i ett
  // fält som inte är nästa steg.
  useEffect(() => {
    if (draft.at) noteRef.current?.focus();
  }, [draft.at]);

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 mb-[10px]">
        <CalendarClock size={12} style={{ color: "var(--accent)" }} />
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          När ska du ringa?
        </p>
        {valid && chosen && (
          <span className="text-[11px] ml-auto" style={{ color: "var(--accent)" }}>
            {formatWhen(chosen)}
          </span>
        )}
      </div>

      {/* Snabbval */}
      <div className="flex flex-wrap gap-[6px] mb-[10px]">
        {quick.map((p) => {
          const value = toDatetimeLocalValue(p.at);
          const active = draft.at === value;
          return (
            <button
              key={p.label}
              onClick={() => onChange({ ...draft, at: value })}
              className="text-[12px] font-medium px-[10px] py-[5px] rounded-md"
              style={{
                background: active ? "var(--accent-muted)" : "var(--surface)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={draft.at}
          onChange={(e) => onChange({ ...draft, at: e.target.value })}
          autoFocus
          className="flex-1 px-3 py-2 text-[13px] rounded-md outline-none mono-nums"
          style={{
            background: "var(--surface)",
            border: `1px solid ${inPast ? "var(--danger-border)" : "var(--border-strong)"}`,
            color: "var(--text)",
          }}
        />
        <button
          onClick={onSave}
          disabled={!valid}
          className="px-4 py-2 text-[12px] font-semibold rounded-md shrink-0"
          style={{
            background: valid ? "var(--accent)" : "var(--surface)",
            color: valid ? "var(--on-accent)" : "var(--text-dim)",
            border: "1px solid var(--border)",
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          Spara ↵
        </button>
      </div>

      {inPast && (
        <p
          className="flex items-center gap-1 text-[11px] mt-[6px]"
          style={{ color: "var(--danger)" }}
        >
          <AlertTriangle size={11} /> Tidpunkten har redan passerat — välj en tid framåt.
        </p>
      )}

      <input
        ref={noteRef}
        type="text"
        value={draft.note}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        placeholder="Vad ska du säga när du ringer? (valfritt)"
        maxLength={300}
        className="w-full px-3 py-2 text-[13px] rounded-md outline-none mt-2"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      />

      {/* Mejlpåminnelse */}
      <label
        className="flex items-center gap-2 mt-[10px] cursor-pointer select-none"
        title="Du får ett mejl på morgonen den dag återkomsten ligger — och varje morgon den ligger kvar oringd."
      >
        <input
          type="checkbox"
          checked={draft.emailReminder}
          onChange={(e) => onChange({ ...draft, emailReminder: e.target.checked })}
          className="w-[15px] h-[15px] shrink-0 cursor-pointer"
          style={{ accentColor: "var(--accent)" }}
        />
        <Mail
          size={12}
          style={{ color: draft.emailReminder ? "var(--accent)" : "var(--text-dim)" }}
        />
        <span
          className="text-[12px] font-medium"
          style={{ color: draft.emailReminder ? "var(--text)" : "var(--text-muted)" }}
        >
          Påminn mig via mejl
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          morgonen den dagen
        </span>
      </label>
    </div>
  );
}
