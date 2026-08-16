"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, Building2, Phone, CalendarClock, Ban, Briefcase, X } from "lucide-react";
import { searchAssignedLeads, type LeadSearchHit } from "@/app/actions/leads";
import { formatSwedish } from "@/lib/phone";
import { formatWhen } from "@/lib/time";

/**
 * Slå upp ett bolag mitt i ett ringpass.
 *
 * Kunden ringer tillbaka, kollegan ropar ett namn över bordet, någon läser upp
 * ett nummer — och säljaren sitter i cockpiten med tangentbordet under
 * händerna. Utan den här rutan är vägen dit: avsluta passet, gå till
 * Ringlistor, sök, öppna, börja om. Med den: ⌘K, skriv, Enter.
 *
 * Samma träfflista som sökfältet på Ringlistor (`searchAssignedLeads`), samma
 * fördröjning och samma brickor — ett bolag ska se likadant ut oavsett var man
 * hittade det.
 *
 * Fältet är fokuserat hela tiden rutan är öppen, och det är också vad som
 * skyddar dispositionen: cockpitens tangentlyssnare släpper igenom allt som
 * kommer från ett `input`, så "3" skriver en trea här i stället för att
 * registrera ett sålt samtal.
 */

const DEBOUNCE_MS = 250;

export function LeadSwitcher({
  onClose,
  onPick,
}: {
  onClose: () => void;
  /** Returnerar ett felmeddelande, eller null när bolaget öppnades. */
  onPick: (hit: LeadSearchHit) => Promise<string | null>;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
          if (cancelled) return;
          setHits(res);
          setCursor(0);
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
    };
  }, [query]);

  async function pick(hit: LeadSearchHit) {
    if (opening) return;
    setOpening(true);
    setError(null);
    const message = await onPick(hit);
    if (message) {
      setOpening(false);
      setError(message);
      return;
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[cursor];
      if (hit) void pick(hit);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(16, 24, 40, 0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        className="w-full max-w-[560px] rounded-lg overflow-hidden shadow-xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
        onKeyDown={onKeyDown}
      >
        <div
          className="flex items-center gap-2.5 px-4 h-[46px]"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {opening ? (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
          ) : (
            <Search size={14} style={{ color: "var(--text-dim)" }} />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök bolag, kontakt, ort, org.nr eller telefon"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: "var(--text)" }}
          />
          {loading && <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-dim)" }} />}
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} aria-label="Stäng">
            <X size={14} />
          </button>
        </div>

        {error && (
          <p
            className="px-4 py-2.5 text-[12px] font-medium"
            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
          >
            {error}
          </p>
        )}

        {query.trim().length < 2 && !error && (
          <p className="px-4 py-3 text-[12px]" style={{ color: "var(--text-dim)" }}>
            Skriv minst två tecken. Enter öppnar bolaget i cockpiten — samtalet du är i nu hoppas över.
          </p>
        )}

        {query.trim().length >= 2 && !loading && searched && hits.length === 0 && (
          <p className="px-4 py-3 text-[12px]" style={{ color: "var(--text-dim)" }}>
            Inget bolag matchar.
          </p>
        )}

        <div className="max-h-[52vh] overflow-y-auto">
          {hits.map((hit, i) => (
            <button
              key={hit.id}
              onClick={() => void pick(hit)}
              onMouseEnter={() => setCursor(i)}
              className="flex items-center gap-3 w-full px-4 py-[9px] text-left"
              style={{
                borderTop: "1px solid var(--border-subtle)",
                background: i === cursor ? "var(--surface-hover)" : "transparent",
              }}
            >
              <Building2 size={13} className="shrink-0" style={{ color: "var(--text-dim)" }} />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
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
      </motion.div>
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
