"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FrameworkStep } from "@/generated/prisma/client";

export interface ResolvedScript {
  templateId: string;
  step: FrameworkStep;
  name: string;
  versionId: string;
  resolved: { variantId: string | null; label: string | null; text: string; empty: boolean };
}

/**
 * Vilka manus säljaren har uppfällda. Ligger i localStorage och inte i state.
 *
 * `CockpitDb` monterar om panelen vid varje leadbyte (`key={lead.id +
 * contactIndex}` på motion-wrappern — animationen är hela poängen med den
 * nyckeln). Ett `useState` här nollställs alltså varje gång säljaren går till
 * nästa bolag, och den som fällt upp avslutsmanuset fick fälla upp det igen
 * 150 gånger om dagen. Nyckeln är templateId, så valet följer manuset och inte
 * dess plats i listan.
 */
const STORAGE_KEY = "cockpit.scripts.open";

function readOpen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeOpen(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Privat läge eller full kvot. Att inte kunna minnas vilket manus som var
    // uppfällt får aldrig vara det som stoppar ett samtal.
  }
}

/**
 * Manuset på skärmen.
 *
 * Varje manus går att fälla upp och ner, **inklusive det första**. Det låg
 * tidigare permanent uppslaget utan knapp, med motiveringen att öppningen är
 * det säljaren behöver i sekund ett. Det stämmer i sekund ett och slutar stämma
 * i sekund trettio — och när ett helt manus ligger i det blocket är det en
 * textvägg som trycker ner allt annat på skärmen resten av samtalet.
 *
 * Första manuset är uppfällt tills säljaren säger något annat. Sedan gäller
 * säljarens val, över både leadbyten och omladdningar.
 */
export function ScriptPanel({ scripts }: { scripts: ResolvedScript[] }) {
  const usable = scripts.filter((s) => !s.resolved.empty && s.resolved.text.trim() !== "");

  // null = inget läst ännu (första rendering på servern och direkt efter
  // hydrering). Skiljs från [] så att "säljaren har fällt ner allt" inte
  // förväxlas med "vi vet inte än" — annars poppar öppningen upp igen vid varje
  // omladdning hos den som stängt den.
  const [open, setOpen] = useState<string[] | null>(null);

  useEffect(() => {
    setOpen(readOpen());
  }, []);

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const current = prev ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      writeOpen(next);
      return next;
    });
  }, []);

  if (usable.length === 0) return null;

  // Serverordningen är den chefen satt (sortOrder). Sortera inte om här — två
  // ordningar för samma manus är två ställen att hålla i synk, och den som
  // bestämmer ordningen sitter i adminvyn.
  const isOpen = (s: ResolvedScript, i: number) =>
    open === null ? i === 0 : open.includes(s.templateId);

  return (
    <div className="mb-3">
      {usable.map((s, i) => {
        const expanded = isOpen(s, i);
        return (
          <div
            key={s.templateId}
            className="rounded-md mb-1.5 overflow-hidden"
            style={{
              // Det uppfällda manuset bär accentytan — det är det säljaren
              // läser ur. De nerfällda är rader, inte kort.
              background: expanded ? "var(--accent-muted)" : "var(--surface-inset)",
              border: `1px solid ${expanded ? "var(--border-strong)" : "var(--border)"}`,
            }}
          >
            <button
              onClick={() => toggle(s.templateId)}
              className="flex items-center justify-between w-full px-3.5 py-2.5 text-left"
            >
              {/* Manusets namn, inte ramverkssteget. Steget är en frivillig
                  etikett som i praktiken sätts godtyckligt — ett helt manus
                  hamnade under "ROI" och rubriken ljög för säljaren. */}
              <span
                className="text-[11px] font-semibold uppercase tracking-widest truncate"
                style={{ color: expanded ? "var(--accent)" : "var(--text-dim)" }}
              >
                {s.name}
              </span>
              {expanded
                ? <ChevronUp size={12} className="shrink-0" style={{ color: expanded ? "var(--accent)" : "var(--text-dim)" }} />
                : <ChevronDown size={12} className="shrink-0" style={{ color: "var(--text-dim)" }} />}
            </button>

            {expanded && (
              // whitespace-pre-wrap: manuset visas precis som det skrevs. HTML
              // slår annars ihop radbrytningar och blankrader till mellanslag,
              // och en styckeindelad öppning blir en enda oläsbar mening mitt i
              // samtalet.
              <p
                className="text-[14.5px] leading-relaxed px-3.5 pb-3.5 whitespace-pre-wrap"
                style={{ color: "var(--text)" }}
              >
                {s.resolved.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
