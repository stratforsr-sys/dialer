"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Phone,
  Clock,
  X,
  Mail,
  MailX,
  AlarmClock,
  CalendarX2,
  Check,
  ClipboardCheck,
} from "lucide-react";
import {
  listCallbacks,
  markCallbacksSeen,
  snoozeCallback,
  cancelCallback,
  setCallbackEmailReminder,
  type CallbackRow,
} from "@/app/actions/callbacks";
import type { CallbackCancelReason, NoReason } from "@/generated/prisma/client";
import { CallbackDisposition } from "@/components/notifications/CallbackDisposition";
import { formatTime, formatWhen, formatRelative, isSameDay } from "@/lib/time";

/**
 * Notisklockan.
 *
 * Problemet den löser: en lovad återuppringning fanns tidigare bara som en
 * tidsstämpel på leadet. Den syntes ingenstans i gränssnittet, och enda vägen
 * tillbaka var att säljaren råkade öppna cockpiten i rätt ringlista efter att
 * tiden passerat. Löften som inte råkade ringas försvann tyst.
 *
 * Tre designval:
 *
 * **Fem minuter är förvarningen.** En notis som kommer på slaget är för sen —
 * säljaren sitter i ett annat samtal. Fem minuter räcker för att avsluta det
 * man håller på med. Gränsen räknas i klienten mot en tickande klocka, inte
 * i en fråga mot servern: annars hade den krävt polling varje sekund för att
 * inte hoppa över minuten.
 *
 * **Missade skriker, kommande viskar.** Räknaren på klockan visar bara det som
 * kräver handling nu — missade plus de inom fem minuter. Räknar man allt
 * kommande blir siffran trettio på en måndag och slutar betyda något.
 *
 * **Panelen är `position: fixed`.** Sidebaren har `overflow: hidden` för sin
 * hover-expansion. Ett absolut positionerat lager hade klippts vid 56 pixlar;
 * ett fixerat har viewporten som containing block och klipps inte — så länge
 * ingen förfader har `transform`, `filter` eller `contain`, vilket ingen i
 * kedjan har. Därför behövs ingen portal och därmed ingen react-dom-import.
 */

/** Minuter före utsatt tid som en återkomst börjar larma. */
const LEAD_TIME_MIN = 5;
/** Hur ofta servern frågas. Klockan tickar lokalt däremellan. */
const POLL_MS = 60_000;
const TICK_MS = 10_000;

type Bucket = "missed" | "now" | "today" | "later";

interface Grouped {
  missed: CallbackRow[];
  now: CallbackRow[];
  today: CallbackRow[];
  later: CallbackRow[];
}

function bucketOf(row: CallbackRow, now: Date): Bucket {
  const diffMin = (row.scheduledAt.getTime() - now.getTime()) / 60_000;
  if (diffMin < 0) return "missed";
  if (diffMin <= LEAD_TIME_MIN) return "now";
  return isSameDay(row.scheduledAt, now) ? "today" : "later";
}

export function NotificationBell({
  expanded,
  isAdmin,
}: {
  expanded: boolean;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<CallbackRow[]>([]);
  const [scope, setScope] = useState<"mine" | "floor">("mine");
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Raden vars samtal håller på att dispositioneras. Bolaget ligger utanför
  // däcket så länge återkomsten är öppen — den här rutan är enda vägen att
  // registrera utfallet, och därmed enda vägen tillbaka in i rotationen.
  const [dispositionRow, setDispositionRow] = useState<CallbackRow | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Data ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await listCallbacks(scope);
      setRows(res.rows);
    } catch {
      // En misslyckad hämtning ska inte tömma listan som redan visas —
      // säljaren är mitt i ett samtal och en klocka som blinkar tom är värre
      // än en som är någon minut gammal.
    }
  }, [scope]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      // Dold flik: låt bli att fråga. Den enda som ser notisen är den som
      // tittar, och en bakgrundsflik som pollar i åtta timmar är ren kostnad.
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Egen klocka: femminutersgränsen passeras utan att servern frågats.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // ── Gruppering ──────────────────────────────────────────────────────────
  const grouped = useMemo<Grouped>(() => {
    const g: Grouped = { missed: [], now: [], today: [], later: [] };
    for (const r of rows) g[bucketOf(r, now)].push(r);
    return g;
  }, [rows, now]);

  const alertCount = grouped.missed.length + grouped.now.length;
  const hasMissed = grouped.missed.length > 0;

  // ── Stäng vid klick utanför och Escape ──────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Öppnad panel kvitterar de olästa. Löftet står kvar — säljaren har sett
  // notisen, inte ringt samtalet.
  useEffect(() => {
    if (!open) return;
    const unseen = rows.filter((r) => !r.seen).map((r) => r.id);
    if (unseen.length === 0) return;
    void markCallbacksSeen(unseen).then(() => {
      setRows((prev) => prev.map((r) => ({ ...r, seen: true })));
    });
  }, [open, rows]);

  // ── Åtgärder ────────────────────────────────────────────────────────────
  const act = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setBusyId(id);
      try {
        await fn();
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  // ── Knappens position, som panelen fästs vid ────────────────────────────
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    function place() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      // Panelen är 380 bred och max 70vh hög. Nära nederkanten backar den
      // uppåt så den inte hamnar utanför fönstret.
      const top = Math.min(r.top, window.innerHeight - Math.min(window.innerHeight * 0.7, 560) - 16);
      setAnchor({ left: r.right + 10, top: Math.max(12, top) });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        title={expanded ? undefined : alertCount > 0 ? `${alertCount} återkomster` : "Återkomster"}
        className="relative flex items-center h-[34px] rounded-md shrink-0 pr-[10px] w-full"
        style={{
          paddingLeft: expanded ? 10 : 12,
          background: open ? "var(--surface-inset)" : "transparent",
          color: hasMissed ? "var(--danger)" : alertCount > 0 ? "var(--accent)" : "var(--text-muted)",
          transition: "background-color 0.12s ease, color 0.12s ease",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "var(--surface-inset)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
      >
        <span className="w-4 flex items-center justify-center shrink-0 relative">
          <Bell size={16} strokeWidth={alertCount > 0 ? 2.2 : 1.8} />
          {/* Hopfälld skena har ingen plats för en siffra — då räcker pricken. */}
          {alertCount > 0 && !expanded && (
            <span
              className="absolute -top-[3px] -right-[4px] w-[7px] h-[7px] rounded-full"
              style={{
                background: hasMissed ? "var(--danger)" : "var(--accent)",
                boxShadow: "0 0 0 2px var(--surface)",
              }}
            />
          )}
        </span>

        <span
          className="ml-3 text-[13px] font-medium whitespace-nowrap"
          style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.14s ease" }}
        >
          Återkomster
        </span>

        {alertCount > 0 && expanded && (
          <span
            className="ml-auto text-[10px] font-bold px-[6px] py-[1px] rounded-full mono-nums"
            style={{
              background: hasMissed ? "var(--danger)" : "var(--accent)",
              color: hasMissed ? "var(--on-danger)" : "var(--on-accent)",
            }}
          >
            {alertCount}
          </span>
        )}
      </button>

      {dispositionRow && (
        <CallbackDisposition
          row={dispositionRow}
          onClose={() => setDispositionRow(null)}
          onDone={() => {
            setDispositionRow(null);
            void load();
          }}
        />
      )}

      {open && anchor && (
        <div
          ref={panelRef}
          className="fixed z-[60] flex flex-col"
              style={{
                left: anchor.left,
                top: anchor.top,
                width: 380,
                maxHeight: "70vh",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                boxShadow: "var(--shadow-3)",
              }}
            >
              {/* Rubrik */}
              <div
                className="flex items-center gap-2 px-4 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
                >
                  Återkomster
                </span>

                {isAdmin && (
                  <div
                    className="ml-auto flex items-center rounded-md overflow-hidden"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {(["mine", "floor"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setScope(s)}
                        className="text-[11px] font-medium px-[10px] py-[3px]"
                        style={{
                          background: scope === s ? "var(--accent-muted)" : "transparent",
                          color: scope === s ? "var(--accent)" : "var(--text-dim)",
                        }}
                      >
                        {s === "mine" ? "Mina" : "Golvet"}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setOpen(false)}
                  className={`${isAdmin ? "" : "ml-auto"} p-1 rounded-sm`}
                  style={{ color: "var(--text-dim)" }}
                  title="Stäng (Esc)"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Lista */}
              <div className="overflow-y-auto flex-1">
                {rows.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Check size={18} style={{ color: "var(--text-faint)" }} className="mx-auto mb-2" />
                    <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>
                      Inga öppna återkomster.
                    </p>
                  </div>
                )}

                <Section
                  title="Missade"
                  color="var(--danger)"
                  rows={grouped.missed}
                  now={now}
                  busyId={busyId}
                  scope={scope}
                  onAct={act}
                  onNavigate={() => setOpen(false)}
                  onDisposition={(r) => {
                    // Panelen stängs bakom rutan. Två lager med varsin
                    // Escape-lyssnare är ett lager för mycket.
                    setDispositionRow(r);
                    setOpen(false);
                  }}
                />
                <Section
                  title={`Dags nu · inom ${LEAD_TIME_MIN} min`}
                  color="var(--accent)"
                  rows={grouped.now}
                  now={now}
                  busyId={busyId}
                  scope={scope}
                  onAct={act}
                  onNavigate={() => setOpen(false)}
                  onDisposition={(r) => {
                    // Panelen stängs bakom rutan. Två lager med varsin
                    // Escape-lyssnare är ett lager för mycket.
                    setDispositionRow(r);
                    setOpen(false);
                  }}
                />
                <Section
                  title="Senare idag"
                  color="var(--text-muted)"
                  rows={grouped.today}
                  now={now}
                  busyId={busyId}
                  scope={scope}
                  onAct={act}
                  onNavigate={() => setOpen(false)}
                  onDisposition={(r) => {
                    // Panelen stängs bakom rutan. Två lager med varsin
                    // Escape-lyssnare är ett lager för mycket.
                    setDispositionRow(r);
                    setOpen(false);
                  }}
                />
                <Section
                  title="Kommande"
                  color="var(--text-dim)"
                  rows={grouped.later}
                  now={now}
                  busyId={busyId}
                  scope={scope}
                  onAct={act}
                  onNavigate={() => setOpen(false)}
                  onDisposition={(r) => {
                    // Panelen stängs bakom rutan. Två lager med varsin
                    // Escape-lyssnare är ett lager för mycket.
                    setDispositionRow(r);
                    setOpen(false);
                  }}
                />
              </div>

              <div
                className="px-4 py-2 shrink-0 text-[11px]"
                style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-dim)" }}
              >
                Kuvertet visar om mejlpåminnelse är på. Klicka för att slå av eller på.
              </div>
        </div>
      )}
    </>
  );
}

// ── Sektion ───────────────────────────────────────────────────────────────

function Section({
  title,
  color,
  rows,
  now,
  busyId,
  scope,
  onAct,
  onNavigate,
  onDisposition,
}: {
  title: string;
  color: string;
  rows: CallbackRow[];
  now: Date;
  busyId: string | null;
  scope: "mine" | "floor";
  onAct: (id: string, fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: () => void;
  onDisposition: (row: CallbackRow) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div>
      <div
        className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest"
        style={{ color }}
      >
        {title} · {rows.length}
      </div>
      {rows.map((r) => (
        <Row
          key={r.id}
          row={r}
          now={now}
          accent={color}
          busy={busyId === r.id}
          showSeller={scope === "floor"}
          onAct={onAct}
          onNavigate={onNavigate}
          onDisposition={onDisposition}
        />
      ))}
    </div>
  );
}

// ── Rad ───────────────────────────────────────────────────────────────────

function Row({
  row,
  now,
  accent,
  busy,
  showSeller,
  onAct,
  onNavigate,
  onDisposition,
}: {
  row: CallbackRow;
  now: Date;
  accent: string;
  busy: boolean;
  showSeller: boolean;
  onAct: (id: string, fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: () => void;
  onDisposition: (row: CallbackRow) => void;
}) {
  const overdue = row.scheduledAt.getTime() < now.getTime();
  /** Står skälpanelen öppen? Se `ReleasePanel`. */
  const [releasing, setReleasing] = useState(false);

  return (
    <div
      className="px-4 py-[10px]"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        opacity: busy ? 0.5 : 1,
        transition: "opacity 0.12s ease",
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="text-[12px] font-semibold mono-nums shrink-0"
          style={{ color: accent }}
        >
          {isSameDay(row.scheduledAt, now)
            ? formatTime(row.scheduledAt)
            : formatWhen(row.scheduledAt, now)}
        </span>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-dim)" }}>
          {formatRelative(row.scheduledAt, now)}
        </span>

        <Link
          href={`/leads/${row.leadId}`}
          onClick={onNavigate}
          className="ml-auto text-[13px] font-medium truncate text-right"
          style={{ color: "var(--text)" }}
          title={row.companyName}
        >
          {row.companyName}
        </Link>
      </div>

      {(row.contactName || showSeller) && (
        <p className="text-[11px] mt-[2px] truncate" style={{ color: "var(--text-muted)" }}>
          {row.contactName}
          {row.contactName && showSeller && " · "}
          {showSeller && row.sellerName}
        </p>
      )}

      {row.note && (
        <p
          className="text-[11px] mt-[4px] whitespace-pre-wrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {row.note}
        </p>
      )}

      {/* Åtgärder. Ring först — det är hela poängen med raden. */}
      <div className="flex items-center gap-1 mt-[6px] flex-wrap">
        {row.phone && (
          <a
            href={`tel:${row.phone}`}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-sm mono-nums"
            style={{
              background: "var(--accent-muted)",
              color: "var(--accent)",
              border: "1px solid var(--accent-border)",
            }}
          >
            <Phone size={10} /> {row.phone}
          </a>
        )}

        {/* Registrera samtalet. Bolaget ligger utanför däcket så länge
            återkomsten är öppen, så det här är enda vägen att bokföra utfallet
            — och därmed enda vägen tillbaka in i rotationen. Direkt efter
            numret, eftersom det är vad man gör när man lagt på. */}
        <ActionButton
          icon={<ClipboardCheck size={10} />}
          label="Registrera samtal"
          title="Ringde du? Registrera utfallet — då avgör dispositionen vad som händer med leadet"
          active
          onClick={() => onDisposition(row)}
        />

        <ActionButton
          icon={<AlarmClock size={10} />}
          label="15 min"
          title="Skjut upp 15 minuter"
          onClick={() => onAct(row.id, () => snoozeCallback(row.id, 15))}
        />
        <ActionButton
          icon={<Clock size={10} />}
          label="1 tim"
          title="Skjut upp en timme"
          onClick={() => onAct(row.id, () => snoozeCallback(row.id, 60))}
        />
        {overdue && (
          <ActionButton
            icon={<Clock size={10} />}
            label="Imorgon"
            title="Flytta till imorgon samma tid"
            onClick={() =>
              onAct(row.id, () =>
                snoozeCallback(row.id, Math.max(15, Math.round((row.scheduledAt.getTime() + 86_400_000 - Date.now()) / 60_000)))
              )
            }
          />
        )}

        <ActionButton
          icon={row.emailReminder ? <Mail size={10} /> : <MailX size={10} />}
          label={row.emailReminder ? "Mejl på" : "Mejl av"}
          title={
            row.emailReminder
              ? "Mejlpåminnelse är på — klicka för att stänga av"
              : "Mejlpåminnelse är av — klicka för att slå på"
          }
          active={row.emailReminder}
          onClick={() =>
            onAct(row.id, () => setCallbackEmailReminder(row.id, !row.emailReminder))
          }
        />

        <ActionButton
          icon={<CalendarX2 size={10} />}
          label="Släpp"
          title="Släpp löftet — kräver ett utfall, precis som ett samtal"
          danger
          active={releasing}
          onClick={() => setReleasing((v) => !v)}
        />
      </div>

      {releasing && (
        <ReleasePanel
          onCancel={() => setReleasing(false)}
          onRelease={(input) =>
            onAct(row.id, async () => {
              await cancelCallback(row.id, input);
              setReleasing(false);
            })
          }
        />
      )}
    </div>
  );
}

// ── Släpp löftet ──────────────────────────────────────────────────────────

/**
 * Skälen, i den ordning en säljare tänker dem.
 *
 * Fyra, inte tio. Panelen öppnas mitt i ett pass och varje extra rad är en rad
 * som inte läses. Var och en motsvarar ett utfall som redan finns i
 * dispositionen — `cancelCallback` skriver samma tillstånd på leadet som det
 * utfallet skulle gett, så att avbokningen inte blir en andra, tystare väg
 * förbi rotationens regler.
 *
 * `Felbokad` ligger sist och `Vill inte bli kontaktad` näst sist, längst från
 * det man siktar på. Den andra är oåterkallelig: den spärrar bolaget permanent
 * på org-numret.
 */
const RELEASE_REASONS: Array<{
  value: CallbackCancelReason;
  label: string;
  hint: string;
  danger?: boolean;
}> = [
  { value: "SA_NEJ", label: "Kunden sa nej", hint: "Vilar 60 dagar" },
  { value: "FEL_NUMMER", label: "Fel nummer", hint: "Spärrar leadet" },
  {
    value: "BORTFALL",
    label: "Vill inte bli kontaktad",
    hint: "Spärrar bolaget permanent",
    danger: true,
  },
  { value: "FELBOKAD", label: "Felbokad — inget besked", hint: "Tillbaka i rotationen" },
];

/** Samma åtta anledningar, samma ordning och samma ord som i cockpiten. */
const RELEASE_NO_REASONS: Array<{ value: NoReason; label: string }> = [
  { value: "PRIS", label: "Pris" },
  { value: "TIMING", label: "Timing" },
  { value: "HAR_BYRA", label: "Har byrå" },
  { value: "HAR_INHOUSE", label: "Har inhouse" },
  { value: "INGET_BEHOV", label: "Inget behov" },
  { value: "NOJD_MED_ANNAN", label: "Nöjd med annan" },
  { value: "NEJ_INNAN_PITCH", label: "Sa nej innan pitch" },
  { value: "VILL_EJ_PRATA_SALJARE", label: "Vill inte prata med säljare" },
];

/**
 * Frågan som gör släppet till ett besked i stället för en städning.
 *
 * Fram till 2026-09-01 var `Avboka` ett klick utan fråga, och bolaget låg
 * tillbaka i hela golvets däck efter tjugo timmar — även när kunden precis
 * sagt nej tack. Beskedet fanns i huvudet på en säljare och ingenstans i
 * datan.
 *
 * Panelen viker ut sig i raden i stället för att lägga sig som en modal:
 * klockan är redan ett lager över allt annat, och ett tredje lager ovanpå det
 * gör det oklart vilken rad man svarar om.
 */
function ReleasePanel({
  onCancel,
  onRelease,
}: {
  onCancel: () => void;
  onRelease: (input: { reason: CallbackCancelReason; noReason?: NoReason | null }) => void;
}) {
  // Ett nej kräver sin anledning. Att skicka i två steg i stället för att
  // förvälja en är hela poängen: ett förvalt "Inget behov" hade blivit det
  // vanligaste nejet i statistiken utan att någon valt det.
  const [askNo, setAskNo] = useState(false);

  return (
    <div
      className="mt-[8px] rounded-md p-[10px]"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-[8px]">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          {askNo ? "Varför sa kunden nej?" : "Vad hände med bolaget?"}
        </p>
        <button
          onClick={askNo ? () => setAskNo(false) : onCancel}
          className="ml-auto text-[10px]"
          style={{ color: "var(--text-dim)" }}
        >
          {askNo ? "Tillbaka" : "Avbryt"}
        </button>
      </div>

      <div className="flex flex-wrap gap-[5px]">
        {askNo
          ? RELEASE_NO_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => onRelease({ reason: "SA_NEJ", noReason: r.value })}
                className="text-[11px] font-medium px-[8px] py-[4px] rounded-sm"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {r.label}
              </button>
            ))
          : RELEASE_REASONS.map((r) => (
              <button
                key={r.value}
                title={r.hint}
                onClick={() =>
                  r.value === "SA_NEJ" ? setAskNo(true) : onRelease({ reason: r.value })
                }
                className="text-left text-[11px] font-medium px-[8px] py-[4px] rounded-sm"
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${r.danger ? "var(--danger-border)" : "var(--border)"}`,
                  color: r.danger ? "var(--danger)" : "var(--text-secondary)",
                }}
              >
                {r.label}
                <span className="block text-[9px]" style={{ color: "var(--text-dim)" }}>
                  {r.hint}
                </span>
              </button>
            ))}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  title,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const color = danger ? "var(--danger)" : active ? "var(--accent)" : "var(--text-dim)";
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 text-[11px] px-2 py-[3px] rounded-sm"
      style={{
        color,
        background: active ? "var(--accent-muted)" : "var(--surface-inset)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
