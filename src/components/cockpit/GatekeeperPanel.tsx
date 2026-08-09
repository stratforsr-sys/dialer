"use client";

import { useState } from "react";
import { Building2, ArrowRight } from "lucide-react";
import { GATEKEEPER_TACTICS } from "@/lib/cockpit-flow";

export interface GatekeeperDraft {
  name: string;
  said: string;
  dmName: string;
  dmAvailability: string;
  tactic: string | null;
}

export const EMPTY_GATEKEEPER: GatekeeperDraft = {
  name: "",
  said: "",
  dmName: "",
  dmAvailability: "",
  tactic: null,
};

/**
 * Växelfångsten.
 *
 * Poängen är inte att dokumentera att man blev stoppad — det är att nästa
 * samtal ska veta vem som svarade och vad som sades. Det verkliga guldet är
 * fälten längst ner: beslutsfattarens namn och när hen är tillbaka. Den
 * uppgiften styr nästa ringtid automatiskt, i stället för att ligga som en
 * anteckning ingen läser.
 */
export function GatekeeperPanel({
  known,
  draft,
  onChange,
  onSubmit,
}: {
  known?: {
    name: string | null;
    lastSaid: string | null;
    dmName: string | null;
    dmAvailability: string | null;
    encounters: number;
    passes: number;
  } | null;
  draft: GatekeeperDraft;
  onChange: (d: GatekeeperDraft) => void;
  onSubmit: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div
      className="rounded-lg p-4 mb-3"
      style={{
        background: "var(--surface-inset)",
        border: "1px solid var(--border)",
      }}
    >
      {known?.name && (
        <div
          className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md"
          style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}
        >
          <Building2 size={13} className="mt-[2px] shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
              Förra gången svarade {known.name}
              {known.encounters > 1 && (
                <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
                  {" "}· {known.passes}/{known.encounters} genomsläppta
                </span>
              )}
            </p>
            {known.lastSaid && (
              <p className="text-[11px] mt-[2px]" style={{ color: "var(--text-muted)" }}>
                &ldquo;{known.lastSaid}&rdquo;
              </p>
            )}
            {known.dmName && (
              <p className="text-[11px] mt-[2px]" style={{ color: "var(--text-muted)" }}>
                Beslutsfattare: <strong>{known.dmName}</strong>
                {known.dmAvailability ? ` — ${known.dmAvailability}` : ""}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field
          label="Vem svarade?"
          value={draft.name}
          placeholder="Namn i växeln"
          onChange={(v) => onChange({ ...draft, name: v })}
          autoFocus
        />
        <Field
          label="Beslutsfattarens namn"
          value={draft.dmName}
          placeholder="Om du fick det"
          onChange={(v) => onChange({ ...draft, dmName: v })}
        />
      </div>

      <Field
        label="När är hen tillbaka?"
        value={draft.dmAvailability}
        placeholder='t.ex. "torsdag förmiddag" — styr nästa ringtid'
        onChange={(v) => onChange({ ...draft, dmAvailability: v })}
      />

      {showAll ? (
        <>
          <div className="mt-2">
            <Field
              label="Vad sades?"
              value={draft.said}
              placeholder="Kort — nästa säljare läser det här"
              onChange={(v) => onChange({ ...draft, said: v })}
            />
          </div>
          <div className="mt-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--text-dim)" }}
            >
              Vad testade du?
            </p>
            <div className="flex flex-wrap gap-1">
              {GATEKEEPER_TACTICS.map((t) => (
                <button
                  key={t.key}
                  onClick={() =>
                    onChange({ ...draft, tactic: draft.tactic === t.key ? null : t.key })
                  }
                  className="px-2 py-1 text-[11px] rounded-sm transition-all"
                  style={{
                    background: draft.tactic === t.key ? "var(--accent)" : "var(--surface)",
                    color: draft.tactic === t.key ? "var(--bg)" : "var(--text-muted)",
                    border: `1px solid ${draft.tactic === t.key ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <button
          onClick={() => setShowAll(true)}
          className="text-[11px] mt-2"
          style={{ color: "var(--text-dim)" }}
        >
          + Vad sades och vad testade du
        </button>
      )}

      <button
        onClick={onSubmit}
        className="flex items-center justify-center gap-1.5 w-full mt-3 px-3 py-2 text-[12px] font-semibold rounded-md"
        style={{ background: "var(--accent)", color: "var(--on-accent)" }}
      >
        Spara och gå vidare <ArrowRight size={12} />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-dim)" }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full mt-[3px] px-3 py-[7px] text-[13px] rounded-md outline-none"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      />
    </label>
  );
}
