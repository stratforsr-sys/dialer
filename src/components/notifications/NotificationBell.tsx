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
} from "lucide-react";
import {
  listCallbacks,
  markCallbacksSeen,
  snoozeCallback,
  cancelCallback,
  setCallbackEmailReminder,
  type CallbackRow,
} from "@/app/actions/callbacks";
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
}: {
  title: string;
  color: string;
  rows: CallbackRow[];
  now: Date;
  busyId: string | null;
  scope: "mine" | "floor";
  onAct: (id: string, fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: () => void;
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
}: {
  row: CallbackRow;
  now: Date;
  accent: string;
  busy: boolean;
  showSeller: boolean;
  onAct: (id: string, fn: () => Promise<unknown>) => Promise<void>;
  onNavigate: () => void;
}) {
  const overdue = row.scheduledAt.getTime() < now.getTime();

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
          label="Avboka"
          title="Ta bort återkomsten — leadet går tillbaka i rotationen"
          danger
          onClick={() => onAct(row.id, () => cancelCallback(row.id))}
        />
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
