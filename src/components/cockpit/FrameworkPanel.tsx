"use client";

import { Check } from "lucide-react";
import type { FrameworkStep } from "@/generated/prisma/client";
import { FRAMEWORK_STEPS, OBJECTION_TAGS } from "@/lib/cockpit-flow";

/**
 * Ramverket som PASSIV rad över hela cockpiten.
 *
 * Medvetet inte klickbar. Att bocka av steg mitt i ett samtal stjäl
 * uppmärksamhet i just de sekunder som avgör det, och blir i praktiken ifyllt
 * efteråt ändå — fast då som gissningar som ser ut som data. Raden finns
 * som stöd för säljaren, inte som inmatning.
 *
 * Ligger vågrätt högst upp och inte som lodrät remsa i kanten: samtalet rör sig
 * framåt genom stegen, och den rörelsen läses i samma riktning som ögat redan
 * går.
 *
 * Bandet spänner över hela bredden, men kedjan centreras över dashens spalt —
 * samma axel som bolagsuppgifterna och dispositionstrappan. Tre element på en
 * axel läser som en komposition; tre olika centrum läser som ett fel.
 */
export function FrameworkRail({
  activeStep,
  gutterClass,
  dashClass,
}: {
  activeStep?: FrameworkStep | null;
  /** Bredden på manusspalten respektive dashens läsbredd. Skickas in i stället
   *  för att hårdkodas här, så raden, dashen och trappan inte kan glida isär
   *  när måtten ändras på ett ställe. */
  gutterClass: string;
  dashClass: string;
}) {
  const steps = FRAMEWORK_STEPS.filter((s) => s.value !== "INVANDNING");

  return (
    <div
      className="flex h-[42px] border-b shrink-0"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Vänster zon: exakt dashens spalt, och kedjan centreras i den. Raden
          ligger därmed på samma axel som bolagsuppgifterna nedanför och
          trappan längst ner — tre element, en axel. */}
      <div className="flex-1 flex justify-center px-6 min-w-0">
        <div className={`w-full ${dashClass} flex items-center justify-center gap-1 overflow-x-auto`}>
          <span
            className="text-[9px] font-semibold uppercase tracking-widest shrink-0 mr-2"
            style={{ color: "var(--text-dim)" }}
          >
            Ramverket
          </span>

          {steps.map((step, i) => {
            const active = activeStep === step.value;
            return (
              <div key={step.value} className="flex items-center shrink-0">
                {/* Förbindelsen mellan stegen. Ritas före steget, aldrig före det
                    första, så raden blir en kedja och inte lösa brickor. */}
                {i > 0 && (
                  <span
                    className="w-[14px] h-[1px] mx-[3px]"
                    style={{ background: "var(--border-strong)" }}
                  />
                )}
                <div
                  className="flex items-center gap-[6px] pl-[5px] pr-[9px] py-[4px] rounded-md transition-colors"
                  style={{
                    background: active ? "var(--accent-muted)" : "transparent",
                    border: `1px solid ${active ? "var(--border-strong)" : "transparent"}`,
                  }}
                >
                  <span
                    className="w-[17px] h-[17px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{
                      background: active ? "var(--accent)" : "var(--surface-inset)",
                      color: active ? "var(--on-accent)" : "var(--text-dim)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[12px] whitespace-nowrap"
                    style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Höger zon: ligger över manusspalten och delar dess kantlinje, så
          linjen mellan dash och manus går obruten från topp till botten.
          Hjälptexten bor här — i vänsterzonen skulle den knuffa kedjan ur
          mitten, och det är kedjan som ska ligga still. */}
      <div
        className={`hidden lg:flex ${gutterClass} shrink-0 items-center px-5 border-l`}
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="hidden xl:block text-[10px] truncate"
          style={{ color: "var(--text-dim)" }}
        >
          Avslut ⇄ invändning — gå tillbaka och fråga igen.
        </span>
      </div>
    </div>
  );
}

/**
 * Efter samtalet: ETT tryck. Ställs bara när säljaren nådde beslutsfattaren
 * och fick nej — det är där det är intressant var samtalet dog.
 *
 * `closeAttempts` är den viktigaste siffran på hela skärmen. En säljare som
 * frågar en gång, får en invändning och lägger på ser identisk ut mot en som
 * frågade tre gånger om man bara mäter hur långt samtalet kom.
 */
export function FrameworkTap({
  endedAtStep,
  closeAttempts,
  objections,
  onStep,
  onCloseAttempts,
  onToggleObjection,
  onSubmit,
  onSkip,
}: {
  endedAtStep: FrameworkStep | null;
  closeAttempts: number;
  objections: string[];
  onStep: (s: FrameworkStep) => void;
  onCloseAttempts: (n: number) => void;
  onToggleObjection: (tag: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        Hur långt kom du?
      </p>

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {FRAMEWORK_STEPS.map((s) => (
          <button
            key={s.value}
            onClick={() => onStep(s.value)}
            className="px-2 py-[7px] text-[11px] font-medium rounded-md transition-all"
            style={{
              background: endedAtStep === s.value ? "var(--accent)" : "var(--surface)",
              color: endedAtStep === s.value ? "var(--bg)" : "var(--text-muted)",
              border: `1px solid ${endedAtStep === s.value ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Hur många gånger bad du om affären?
        </span>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onCloseAttempts(n)}
              className="w-7 h-7 text-[12px] font-bold rounded-sm transition-all"
              style={{
                background: closeAttempts === n ? "var(--accent)" : "var(--surface)",
                color: closeAttempts === n ? "var(--bg)" : "var(--text-muted)",
                border: `1px solid ${closeAttempts === n ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {n === 3 ? "3+" : n}
            </button>
          ))}
        </div>
      </div>

      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-1"
        style={{ color: "var(--text-dim)" }}
      >
        Invändningar
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {OBJECTION_TAGS.map((o) => {
          const on = objections.includes(o.tag);
          return (
            <button
              key={o.tag}
              onClick={() => onToggleObjection(o.tag)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-sm transition-all"
              style={{
                background: on ? "var(--accent)" : "var(--surface)",
                color: on ? "var(--bg)" : "var(--text-muted)",
                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {on && <Check size={9} />}
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSubmit}
          className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-md"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Spara (Enter)
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-2 text-[12px] rounded-md"
          style={{
            color: "var(--text-dim)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          Hoppa över
        </button>
      </div>
    </div>
  );
}
