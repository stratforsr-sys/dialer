"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, AlarmClock } from "lucide-react";
import { listCallbacks, markCallbacksSeen, type CallbackRow } from "@/app/actions/callbacks";
import { formatTime, formatWhen, formatRelative, isSameDay } from "@/lib/time";

/**
 * Återkomstklockan i cockpit.
 *
 * Klockan i sidomenyn kunde säljaren inte se: `cockpit/layout.tsx` ritar ingen
 * sidomeny, för passet ska vara helskärm. Enda vägen till sina löften var att
 * lämna ringpasset, vilket ingen gör mitt i ett samtal — och därför gjorde
 * ingen det alls.
 *
 * Fyra skillnader mot klockan i sidomenyn, alla avsiktliga:
 *
 * **Bara det som är dags visas.** Sidomenyns klocka listar även "senare idag"
 * och "kommande", för den är en planeringsvy. Här är den ett avbrott i ett
 * pass: allt som inte kräver ett samtal inom fem minuter är brus, och brus i
 * cockpit kostar samtal.
 *
 * **Fem minuters förvarning, samma som sidomenyn.** En notis som kommer på
 * slaget är för sen — säljaren sitter i ett annat samtal och hinner inte runda
 * av. Gränsen räknas mot en lokal klocka, inte i en fråga mot servern, annars
 * hade den krävt polling varje sekund för att inte hoppa över minuten.
 *
 * **Raden är knappen.** Inga snooza-, avboka- eller mejlknappar. De finns kvar
 * i sidomenyns klocka, där det finns plats att fundera. Här gör man en sak:
 * trycker på bolaget och hamnar i det.
 *
 * **Notisen kommer när tiden går in, inte när säljaren loggar in.** Bara rader
 * som passerar femminutersgränsen medan cockpiten står öppen ger en notis. Det
 * som redan var förfallet när passet började ligger i klockan med röd siffra —
 * en skärm som möts av fyra notiser vid inloggning lär säljaren att klicka bort
 * dem utan att läsa.
 *
 * **Och den går bort när bolaget är ringt, inte när en timer löper ut.** Bandet
 * låg först kvar i tolv sekunder. Det är fel håll på båda ändarna: en säljare
 * som sitter i ett samtal medan nedräkningen går missar löftet helt, och när
 * samtalet väl var ringt satt bandet ändå kvar tills nästa hämtning. Krysset
 * finns kvar som "inte nu" — det gömmer bandet men raden ligger kvar i klockan,
 * för ett löfte lämnar klockan på två sätt: det ringdes, eller det avbokades.
 */

/** Minuter före utsatt tid som en återkomst blir aktuell. Samma som sidomenyn. */
const LEAD_TIME_MIN = 5;
/** Hur ofta servern frågas. Klockan tickar lokalt däremellan. */
const POLL_MS = 60_000;
const TICK_MS = 10_000;
/**
 * Fler samtidiga notiser än så är en lista, inte ett avbrott.
 *
 * Taket väger tyngre nu än när bandet försvann av sig självt: notisen ligger
 * kvar tills bolaget är ringt, så tre band är tre band tills säljaren gör
 * något åt dem.
 */
const MAX_TOASTS = 3;
/**
 * Bandets bredd: ungefär halva cockpiten, som beställt.
 *
 * `clamp` och inte rena `50%`, för procent ensamt går sönder i båda ändarna —
 * på en laptop i delad skärm blir halva bredden 300 pixlar och bolagsnamnet
 * kapas, på en 34-tums ultrabred blir det ett band på nästan tusen pixlar som
 * läser som ett fel i layouten. Höjden sätts av innehållet.
 */
const TOAST_WIDTH = "clamp(360px, 50vw, 760px)";

/** Är återkomsten aktuell nu? Förfallna räknas alltid som aktuella. */
function isDue(row: CallbackRow, now: Date): boolean {
  return (row.scheduledAt.getTime() - now.getTime()) / 60_000 <= LEAD_TIME_MIN;
}

export function CallbackBell({
  onOpenLead,
  calledLead,
}: {
  /** Öppnar bolaget i passet. Returnerar ett felmeddelande, eller null. */
  onOpenLead: (leadId: string, callbackId: string) => Promise<string | null>;
  /**
   * Bolaget som just dispositionerats, med tidsstämpel så att två samtal på
   * samma bolag räknas som två händelser. Klockan pollar var sextionde
   * sekund och dispositionen går genom en skriv-bakom-kö — utan den här
   * signalen låg bandet kvar i upp till en minut efter att samtalet var klart.
   */
  calledLead: { leadId: string; at: number } | null;
}) {
  const [rows, setRows] = useState<CallbackRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<CallbackRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Rader som redan gett en notis. Töms när raden slutar vara aktuell, så en
   *  återkomst som snoozats femton minuter larmar igen när den kommer åter. */
  const alertedRef = useRef<Set<string>>(new Set());
  /** Första hämtningen seedar utan att larma — se rubrikkommentaren. */
  const seededRef = useRef(false);

  // ── Data ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await listCallbacks("mine");
      setRows(res.rows);
      setLoaded(true);
    } catch {
      // En misslyckad hämtning ska inte tömma klockan som redan visas.
      // Säljaren är mitt i ett samtal och en klocka som blinkar tom är värre
      // än en som är en minut gammal.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void load();
        setNow(new Date());
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const due = useMemo(() => rows.filter((r) => isDue(r, now)), [rows, now]);
  const overdue = due.some((r) => r.scheduledAt.getTime() < now.getTime());

  // ── Notisen: raden som just passerade gränsen ───────────────────────────
  useEffect(() => {
    // Innan servern svarat en första gång är `due` tom av okunskap, inte för
    // att inget är dags. Att seeda på den tomheten hade gjort att allt som
    // fanns när passet började larmade en gång — precis tvärtom mot avsikten.
    if (!loaded) return;

    const dueIds = new Set(due.map((r) => r.id));

    // Rader som inte längre är aktuella får larma igen nästa gång de blir det.
    for (const id of Array.from(alertedRef.current)) {
      if (!dueIds.has(id)) alertedRef.current.delete(id);
    }

    if (!seededRef.current) {
      // Första varvet: notera vad som redan var dags utan att avbryta passet.
      dueIds.forEach((id) => alertedRef.current.add(id));
      seededRef.current = true;
      return;
    }

    const fresh = due.filter((r) => !alertedRef.current.has(r.id));
    if (fresh.length === 0) return;
    for (const r of fresh) alertedRef.current.add(r.id);
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_TOASTS));
  }, [due, loaded]);

  /**
   * Samtalet är ringt — bandet och raden går bort direkt.
   *
   * Här låg tidigare en timer på tolv sekunder. Den var fel av två skäl. Ett
   * löfte som försvinner för att klockan tickat är exakt hur löften tappas
   * bort: säljaren satt i ett samtal medan bandet räknade ner. Och när
   * samtalet väl var ringt låg bandet ändå kvar upp till en minut, eftersom
   * klockan pollar var sextionde sekund och dispositionen dessutom går genom
   * en skriv-bakom-kö. Bandet försvann alltså när det inte skulle och satt
   * kvar när det skulle bort.
   *
   * Ingen ny fråga till servern här. Raden tas bort lokalt, och nästa
   * ordinarie hämtning bär sanningen: gick skrivningen igenom kommer den inte
   * tillbaka, och gick den INTE igenom kommer den tillbaka och larmar om —
   * vilket är rätt, för då är löftet fortfarande ohållet.
   */
  useEffect(() => {
    if (!calledLead) return;
    setRows((prev) => prev.filter((r) => r.leadId !== calledLead.leadId));
    setToasts((prev) => prev.filter((t) => t.leadId !== calledLead.leadId));
  }, [calledLead]);

  // ── Öppnad panel kvitterar ──────────────────────────────────────────────
  // Löftet står kvar — säljaren har sett notisen, inte ringt samtalet.
  useEffect(() => {
    if (!open) return;
    const unseen = due.filter((r) => !r.seen).map((r) => r.id);
    if (unseen.length === 0) return;
    void markCallbacksSeen(unseen).then(() => {
      setRows((prev) => prev.map((r) => (unseen.includes(r.id) ? { ...r, seen: true } : r)));
    });
  }, [open, due]);

  // ── Stäng vid klick utanför och Escape ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    // Cockpitens dispositionsgenvägar ligger på `window` och bryr sig inte om
    // att en panel är öppen — den enda grinden där är att markören står i ett
    // fält, och den här panelen har inga fält. Utan det här hade ett tryck på
    // "1" medan säljaren läser en återkomst bokfört ett samtal på bolaget hen
    // råkar stå på. Lyssnaren fångar i capture-fasen, alltså före window, och
    // släpper igenom kortkommandon med meta/ctrl så att ⌘K fortfarande når fram.
    function onKeyCapture(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        e.stopPropagation();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.stopPropagation();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyCapture, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyCapture, true);
    };
  }, [open]);

  // ── Panelens position ───────────────────────────────────────────────────
  // Fixerad, inte absolut: cockpitens toppfält är `shrink-0` i en flexkolumn
  // med `overflow-hidden`, så ett absolut lager hade klippts vid 52 pixlar.
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    function place() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setAnchor({ right: Math.max(12, window.innerWidth - r.right), top: r.bottom + 8 });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // ── Gå till bolaget ─────────────────────────────────────────────────────
  const goTo = useCallback(
    async (row: CallbackRow) => {
      setOpen(false);
      setToasts((prev) => prev.filter((p) => p.id !== row.id));
      const message = await onOpenLead(row.leadId, row.id);
      if (message) {
        setError(message);
        setTimeout(() => setError(null), 6000);
      }
    },
    [onOpenLead]
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        title={due.length > 0 ? `${due.length} återkomster är dags` : "Inga återkomster är dags"}
        className="relative flex items-center justify-center w-[26px] h-[26px] rounded-sm shrink-0"
        style={{
          background: open ? "var(--surface-inset)" : "transparent",
          color: overdue ? "var(--danger)" : due.length > 0 ? "var(--accent)" : "var(--text-dim)",
          transition: "background-color 0.12s ease, color 0.12s ease",
        }}
      >
        <Bell size={15} strokeWidth={due.length > 0 ? 2.2 : 1.8} />
        {due.length > 0 && (
          <span
            className="absolute -top-[3px] -right-[3px] min-w-[14px] h-[14px] px-[3px] flex items-center justify-center rounded-full text-[9px] font-bold mono-nums"
            style={{
              background: overdue ? "var(--danger)" : "var(--accent)",
              color: overdue ? "var(--on-danger)" : "var(--on-accent)",
              boxShadow: "0 0 0 2px var(--surface)",
            }}
          >
            {due.length}
          </span>
        )}
      </button>

      {/* Notisbandet.
       *
       * Centrerat och brett i stället för en liten ruta i hörnet: en säljare
       * som läser manuset har blicken i mitten av skärmen, och ett hörn är
       * precis där ingenting syns under timme åtta.
       *
       * Bandet kommer in ovanifrån med en fjäder, som en iPhone-notis. Det
       * stannar UNDER toppfältet i stället för att täcka det — en notis som
       * lägger sig över "Avsluta" och klockan den själv kom ur döljer vägen
       * vidare i samma sekund som den ber om uppmärksamhet.
       *
       * Centreringen sker med `left: 0; right: 0; margin-inline: auto`, inte
       * med `translateX(-50%)`: framer-motions `layout` mäter mot viewporten,
       * och en transformerad förälder ger den fel svar när två band byter
       * plats. Containern släpper igenom pekaren — bara banden tar emot klick,
       * annars hade en osynlig ruta legat över manuset. */}
      <div
        className="fixed z-[70] flex flex-col gap-2 items-center pointer-events-none"
        style={{ top: 62, left: 0, right: 0, marginInline: "auto", width: TOAST_WIDTH }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              onClick={() => void goTo(t)}
              className="notice-glass pointer-events-auto w-full flex items-center gap-3 pl-4 pr-3 py-2.5 text-left"
            >
              <AlarmClock size={17} className="shrink-0" style={{ opacity: 0.9 }} />

              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold truncate">{t.companyName}</span>
                <span className="block text-[11px] truncate" style={{ opacity: 0.82 }}>
                  Återkomst {formatTime(t.scheduledAt)}
                  {t.contactName ? ` · ${t.contactName}` : ""}
                  {t.note ? ` · ${t.note}` : ""}
                </span>
              </span>

              <span
                className="shrink-0 text-[11px] font-medium px-2.5 py-[3px] rounded-sm hidden sm:block"
                style={{ background: "var(--danger-glass-edge)" }}
              >
                Ta bolaget
              </span>

              <X
                size={14}
                className="shrink-0"
                style={{ opacity: 0.7 }}
                aria-label="Inte nu — bandet göms, återkomsten ligger kvar i klockan"
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((p) => p.id !== t.id));
                }}
              />
            </motion.button>
          ))}
        </AnimatePresence>

        {error && (
          <div className="notice-glass pointer-events-auto w-full px-4 py-2.5 text-[12px]">{error}</div>
        )}
      </div>

      {/* Panelen */}
      {open && anchor && (
        <div
          ref={panelRef}
          className="fixed z-[70] flex flex-col"
          style={{
            right: anchor.right,
            top: anchor.top,
            width: 340,
            maxHeight: "min(60vh, 480px)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-3)",
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              className="text-[12px] font-semibold"
              style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
            >
              Dags att ringa
            </span>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto p-1 rounded-sm"
              style={{ color: "var(--text-dim)" }}
              title="Stäng (Esc)"
            >
              <X size={13} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {due.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Check size={18} style={{ color: "var(--text-faint)" }} className="mx-auto mb-2" />
                <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>
                  Inga återkomster är dags just nu.
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                  Kommande syns här {LEAD_TIME_MIN} minuter innan utsatt tid.
                </p>
              </div>
            ) : (
              due.map((r) => <Row key={r.id} row={r} now={now} onPick={() => void goTo(r)} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Rad ───────────────────────────────────────────────────────────────────
// Hela raden är knappen. Att skjuta upp, avboka eller ändra mejlpåminnelsen
// gör man i sidomenyns klocka — i ett pass ska raden svara på en enda fråga:
// vilket bolag ringer jag nu?

function Row({ row, now, onPick }: { row: CallbackRow; now: Date; onPick: () => void }) {
  const late = row.scheduledAt.getTime() < now.getTime();
  const accent = late ? "var(--danger)" : "var(--accent)";

  return (
    <button
      onClick={onPick}
      className="w-full text-left px-4 py-[10px] block"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Spans, inte div och p: allt här ligger inne i en button, och en
          button får bara innehålla phrasing content. */}
      <span className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold mono-nums shrink-0" style={{ color: accent }}>
          {isSameDay(row.scheduledAt, now) ? formatTime(row.scheduledAt) : formatWhen(row.scheduledAt, now)}
        </span>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-dim)" }}>
          {formatRelative(row.scheduledAt, now)}
        </span>
        <span
          className="ml-auto text-[13px] font-medium truncate text-right"
          style={{ color: "var(--text)" }}
          title={row.companyName}
        >
          {row.companyName}
        </span>
      </span>

      {row.contactName && (
        <span className="block text-[11px] mt-[2px] truncate" style={{ color: "var(--text-muted)" }}>
          {row.contactName}
        </span>
      )}

      {row.note && (
        <span className="block text-[11px] mt-[4px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
          {row.note}
        </span>
      )}
    </button>
  );
}
