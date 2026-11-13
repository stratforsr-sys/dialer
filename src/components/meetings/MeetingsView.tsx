"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck, Video, MapPin, Phone, ExternalLink, AlertTriangle, ChevronDown, PhoneCall,
} from "lucide-react";
import {
  needsOutcome, isOngoing, meetingEnd, meetingStats, statusLabel, pct,
  KIND_LABELS, NO_REASON_LABELS, type MeetingKindLike,
} from "@/lib/moten";
import { formatTime, formatDate, formatRelative, isSameDay, startOfDay } from "@/lib/time";
import { MeetingCalendarLinks } from "./MeetingCalendarLinks";
import { ResolveMeetingDialog } from "./ResolveMeetingDialog";
import { EditMeetingDialog } from "./EditMeetingDialog";
import type { MeetingRow } from "@/app/actions/meetings";

/**
 * /meetings — bokade möten, i den ordning de kräver något av en.
 *
 * Överst det som väntar på ett beslut: möten vars tid gått ut utan ett utfall.
 * Det är samma regel som återkomsterna: ett möte lämnar listan av ett beslut,
 * aldrig av en klocka, och ett passerat möte utan utfall håller bolaget
 * utanför ringlistan tills någon säger hur det gick. Därför ligger de först
 * och syns i rött — inte i en flik man måste komma ihåg att öppna.
 *
 * Sedan det som pågår, sedan kalendern dag för dag, och sist det som avgjorts
 * de senaste 30 dagarna, hopfällt.
 *
 * Det levande på sidan är tiden: "nästa möte om 47 min" räknas ned medan
 * sidan står öppen, och ett möte flyttar sig själv från "Kommande" till
 * "Pågår" till "Utfall saknas" utan att någon laddar om. Talen överst är
 * golvets egna — bokade, show rate, sålda — räknade ur samma rader som listan.
 */

const KIND_ICON: Record<MeetingKindLike, typeof Video> = {
  DIGITALT: Video,
  FYSISKT: MapPin,
  TELEFON: Phone,
};

const INDIGO = "#6366F1";

interface BoardRow {
  scheduledAt: Date;
  durationMin: number;
  status: "BOOKED" | "HELD" | "NO_SHOW" | "CANCELLED";
  outcome: "SALD" | "NEJ" | "UPPFOLJNING" | null;
  bookedById: string;
  bookedBy: { name: string };
}

export function MeetingsView({
  open,
  recent,
  scope,
  isAdmin,
  userId,
  holders,
  board,
}: {
  open: MeetingRow[];
  recent: MeetingRow[];
  scope: "mine" | "floor";
  isAdmin: boolean;
  userId: string;
  holders: Array<{ id: string; name: string }>;
  board: { rows: BoardRow[]; callsBy: Record<string, number> } | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [resolving, setResolving] = useState<{ m: MeetingRow; cancel: boolean } | null>(null);
  const [editing, setEditing] = useState<MeetingRow | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Tiden tickar så att ett möte går från "Kommande" till "Pågår" till
  // "Utfall saknas" av sig självt. Var 20:e sekund räcker — minuterna är
  // upplösningen allt på sidan visas i.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const awaiting = open.filter((m) => needsOutcome(m, now));
  const ongoing = open.filter((m) => isOngoing(m, now));
  const upcoming = open.filter((m) => m.scheduledAt.getTime() > now.getTime());

  // Kommande, dag för dag i svensk tid.
  const days = useMemo(() => {
    const groups: Array<{ key: string; label: string; rows: MeetingRow[] }> = [];
    const tomorrow = new Date(startOfDay(now).getTime() + 26 * 3600_000);
    for (const m of upcoming) {
      const key = startOfDay(m.scheduledAt).toISOString();
      let g = groups.find((x) => x.key === key);
      if (!g) {
        const label = isSameDay(m.scheduledAt, now)
          ? "I dag"
          : isSameDay(m.scheduledAt, tomorrow)
            ? "I morgon"
            : formatDate(m.scheduledAt);
        g = { key, label, rows: [] };
        groups.push(g);
      }
      g.rows.push(m);
    }
    return groups;
  }, [upcoming, now]);

  // Talen överst: de senaste 30 dagarnas bokningar ur samma rader.
  const stats = useMemo(() => {
    const since = now.getTime() - 30 * 86_400_000;
    const rows = [...open, ...recent].filter((m) => m.createdAt.getTime() >= since);
    return meetingStats(rows, now);
  }, [open, recent, now]);

  const next = upcoming[0] ?? null;

  function done(message: string) {
    setResolving(null);
    setEditing(null);
    setToast(message);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Rubrikraden */}
      <div
        className="flex items-center gap-4 px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1 className="text-[15px] shrink-0" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
          Möten
        </h1>
        {next && (
          <span className="text-[12px] mono-nums truncate" style={{ color: "var(--text-muted)" }} data-testid="next-meeting">
            Nästa {formatRelative(next.scheduledAt, now)} — {next.lead.companyName}
          </span>
        )}
        <div className="flex-1" />
        {isAdmin && (
          <div className="segmented shrink-0" role="tablist">
            <Link href="/meetings" className={`segmented-item ${scope === "mine" ? "active" : ""}`}>Mina</Link>
            <Link href="/meetings?scope=floor" className={`segmented-item ${scope === "floor" ? "active" : ""}`}>Golvet</Link>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[980px] mx-auto px-6 py-6 flex flex-col gap-6">
          {/* Talen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Bokade · 30 d" value={String(stats.booked)} sub={`${stats.upcoming} kommande`} />
            <Stat
              label="Show rate"
              value={pct(stats.showRate)}
              sub={stats.held + stats.noShow > 0 ? `${stats.held} av ${stats.held + stats.noShow} kom` : "inget avgjort än"}
            />
            <Stat
              label="Sålda på möte"
              value={String(stats.sold)}
              sub={stats.held > 0 ? `${pct(stats.closeRate)} av genomförda` : "–"}
            />
            <Stat
              label="Väntar på utfall"
              value={String(awaiting.length)}
              sub={awaiting.length > 0 ? "sätt dem nedan" : "allt är avgjort"}
              tone={awaiting.length > 0 ? "danger" : undefined}
            />
          </div>

          {open.length === 0 && recent.length === 0 && (
            <div className="text-center py-16">
              <CalendarCheck size={28} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
              <p className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Inga möten än</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                Tryck <span className="mono-nums">4</span> Nådde beslutsfattaren och sedan{" "}
                <span className="mono-nums">5</span> Möte bokat i dialern.
              </p>
            </div>
          )}

          {/* Utfall saknas */}
          {awaiting.length > 0 && (
            <Section
              title="Utfall saknas"
              hint="Bolagen ligger utanför ringlistan tills mötet fått ett utfall"
              tone="danger"
            >
              {awaiting.map((m) => (
                <Row key={m.id} m={m} now={now} userId={userId} scope={scope} attention
                  onResolve={() => setResolving({ m, cancel: false })}
                  onEdit={() => setEditing(m)} />
              ))}
            </Section>
          )}

          {/* Pågår */}
          {ongoing.length > 0 && (
            <Section title="Pågår nu">
              {ongoing.map((m) => (
                <Row key={m.id} m={m} now={now} userId={userId} scope={scope}
                  onResolve={() => setResolving({ m, cancel: false })}
                  onEdit={() => setEditing(m)} />
              ))}
            </Section>
          )}

          {/* Kommande */}
          {days.map((d) => (
            <Section key={d.key} title={d.label} count={d.rows.length}>
              {d.rows.map((m) => (
                <Row key={m.id} m={m} now={now} userId={userId} scope={scope} future
                  onResolve={() => setResolving({ m, cancel: true })}
                  onEdit={() => setEditing(m)} />
              ))}
            </Section>
          ))}

          {/* Golvet per säljare — admin */}
          {board && board.rows.length > 0 && <Board board={board} now={now} />}

          {/* Avgjorda */}
          {recent.length > 0 && (
            <div>
              <button
                onClick={() => setShowRecent((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                <ChevronDown size={12} style={{ transform: showRecent ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                Avgjorda senaste 30 dagarna · {recent.length}
              </button>
              {showRecent && (
                <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {recent.map((m) => (
                    <Row key={m.id} m={m} now={now} userId={userId} scope={scope} resolved />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {resolving && (
        <ResolveMeetingDialog
          meeting={resolving.m}
          startWithCancel={resolving.cancel}
          holders={holders}
          selfId={userId}
          onClose={() => setResolving(null)}
          onResolved={done}
        />
      )}
      {editing && (
        <EditMeetingDialog
          meeting={editing}
          holders={holders}
          selfId={userId}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            role="status"
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[55] px-4 py-2.5 rounded-lg text-[13px] font-medium lifted"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            data-testid="meetings-toast"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "danger" }) {
  return (
    <div className="stat-module">
      <p className="stat-label">{label}</p>
      <p className="stat-value mono-nums" style={tone === "danger" ? { color: "var(--danger)" } : undefined}>{value}</p>
      <p className="text-[11px] mt-[2px]" style={{ color: "var(--text-dim)" }}>{sub}</p>
    </div>
  );
}

function Section({
  title, hint, count, tone, children,
}: {
  title: string;
  hint?: string;
  count?: number;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: tone === "danger" ? "var(--danger)" : "var(--text-dim)" }}>
          {title}{count !== undefined ? ` · ${count}` : ""}
        </h2>
        {hint && <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>{hint}</span>}
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "var(--surface)",
          border: `1px solid ${tone === "danger" ? "var(--danger-border)" : "var(--border)"}`,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({
  m, now, userId, scope, attention, future, resolved, onResolve, onEdit,
}: {
  m: MeetingRow;
  now: Date;
  userId: string;
  scope: "mine" | "floor";
  attention?: boolean;
  future?: boolean;
  resolved?: boolean;
  onResolve?: () => void;
  onEdit?: () => void;
}) {
  const Icon = KIND_ICON[m.kind];
  const end = meetingEnd(m);
  const ongoing = isOngoing(m, now);
  const isLink = !!m.location && /^https?:\/\//i.test(m.location);
  const status = statusLabel(m, now);
  const who =
    m.holder.id === m.bookedBy.id
      ? m.holder.id === userId ? null : m.holder.name
      : `${m.bookedBy.id === userId ? "Du" : m.bookedBy.name} bokade · ${m.holder.id === userId ? "du" : m.holder.name} håller`;

  return (
    <div
      className="flex items-start gap-4 px-4 py-3"
      style={{ borderBottom: "1px solid var(--border-subtle)", opacity: resolved ? 0.85 : 1 }}
      data-testid="meeting-row"
      data-meeting-id={m.id}
    >
      {/* Tiden — det man läser först */}
      <div className="w-[108px] shrink-0 pt-[1px]">
        <p className="text-[14px] font-semibold mono-nums" style={{ color: attention ? "var(--danger)" : "var(--text)" }}>
          {formatTime(m.scheduledAt)}
        </p>
        <p className="text-[11px] mono-nums whitespace-nowrap" style={{ color: "var(--text-dim)" }}>
          –{formatTime(end)} · {m.durationMin} min
        </p>
        {(attention || resolved) && (
          <p className="text-[11px] mono-nums" style={{ color: "var(--text-dim)" }}>{formatDate(m.scheduledAt)}</p>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/leads/${m.leadId}`} className="text-[13px] font-semibold truncate hover:underline" style={{ color: "var(--text)" }}>
            {m.lead.companyName}
          </Link>
          {ongoing && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-sm shrink-0"
              style={{ background: `${INDIGO}1A`, color: INDIGO }}>Pågår</span>
          )}
          {m.rescheduleCount > 0 && !resolved && (
            <span className="text-[11px] shrink-0" style={{ color: "var(--text-dim)" }}
              title="Antal gånger mötet flyttats">flyttat {m.rescheduleCount}×</span>
          )}
        </div>
        <p className="text-[12px] mt-[1px] truncate" style={{ color: "var(--text-muted)" }}>
          {m.contactName ?? "Ingen kontaktperson"}
          {m.contactPhone ? <span className="mono-nums"> · {m.contactPhone}</span> : null}
          {m.contactEmail ? ` · ${m.contactEmail}` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-[12px] mt-[3px] min-w-0" style={{ color: "var(--text-secondary)" }}>
          <Icon size={12} className="shrink-0" style={{ color: INDIGO }} />
          <span className="shrink-0">{KIND_LABELS[m.kind]}</span>
          {m.location && (
            isLink ? (
              <a href={m.location} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate hover:underline" style={{ color: "var(--accent)" }}>
                · Öppna länken <ExternalLink size={10} />
              </a>
            ) : (
              <span className="truncate">· {m.location}</span>
            )
          )}
        </p>
        {m.note && (
          <p className="text-[12px] mt-[3px] whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>{m.note}</p>
        )}
        {(who || scope === "floor") && (
          <p className="text-[11px] mt-[3px]" style={{ color: "var(--text-dim)" }}>
            {who ?? `${m.holder.name} håller`}
          </p>
        )}
        {resolved && (
          <p className="text-[12px] mt-[3px] font-medium" style={{ color: m.outcome === "SALD" ? "var(--success)" : "var(--text-secondary)" }}>
            {status}
            {m.noReason ? ` · ${NO_REASON_LABELS[m.noReason]}` : ""}
            {m.outcomeNote ? <span className="font-normal" style={{ color: "var(--text-muted)" }}> — {m.outcomeNote}</span> : null}
          </p>
        )}
        {!resolved && (
          <div className="mt-2">
            <MeetingCalendarLinks
              size="xs"
              meeting={{
                id: m.id,
                start: m.scheduledAt,
                durationMin: m.durationMin,
                companyName: m.lead.companyName,
                contactName: m.contactName,
                contactEmail: m.contactEmail,
                contactPhone: m.contactPhone,
                kindLabel: KIND_LABELS[m.kind],
                location: m.location,
                note: m.note,
                holderName: m.holder.name,
              }}
            />
          </div>
        )}
      </div>

      {!resolved && (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {attention || ongoing ? (
            <button onClick={onResolve} className="btn-secondary btn-sm" data-testid="resolve-button"
              style={attention ? { borderColor: "var(--danger-border)", color: "var(--danger)" } : undefined}>
              {attention && <AlertTriangle size={12} />} Hur gick det?
            </button>
          ) : (
            <span className="text-[11px] mono-nums" style={{ color: "var(--text-dim)" }}>
              {formatRelative(m.scheduledAt, now)}
            </span>
          )}
          <div className="flex items-center gap-1">
            <Link href={`/cockpit?leadId=${m.leadId}`} className="btn-ghost btn-sm" title="Öppna bolaget i dialern — till exempel för att bekräfta mötet">
              <PhoneCall size={12} />
            </Link>
            <button onClick={onEdit} className="btn-ghost btn-sm" data-testid="edit-button">Ändra</button>
            {future && (
              <button onClick={onResolve} className="btn-ghost btn-sm" data-testid="cancel-button">Avboka</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Golvet per säljare — bokningen krediteras den som bokade. Bredvid antalet
 * står show rate och sålda, så att ett tal som går att blåsa upp (bokade) alltid
 * läses ihop med de två som inte går det. Samtal per möte svarar på hur mycket
 * ringande ett möte kostar.
 */
function Board({ board, now }: { board: { rows: BoardRow[]; callsBy: Record<string, number> }; now: Date }) {
  const per = new Map<string, { name: string; rows: BoardRow[] }>();
  for (const r of board.rows) {
    const e = per.get(r.bookedById) ?? { name: r.bookedBy.name, rows: [] };
    e.rows.push(r);
    per.set(r.bookedById, e);
  }
  const lines = Array.from(per.entries())
    .map(([id, e]) => ({ id, name: e.name, s: meetingStats(e.rows, now), calls: board.callsBy[id] ?? 0 }))
    .sort((a, b) => b.s.booked - a.s.booked);

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
        Per säljare · 30 d
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <table className="w-full text-[12px] mono-nums" data-testid="meeting-board">
          <thead>
            <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border-subtle)" }}>
              {["Säljare", "Bokade", "Genomförda", "Kom inte", "Show rate", "Sålda", "Samtal/möte"].map((h, i) => (
                <th key={h} className={`px-4 py-2 font-medium text-[11px] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                <td className="px-4 py-2 text-left font-sans" style={{ color: "var(--text)" }}>{l.name}</td>
                <td className="px-4 py-2 text-right">{l.s.booked}</td>
                <td className="px-4 py-2 text-right">{l.s.held}</td>
                <td className="px-4 py-2 text-right">{l.s.noShow}</td>
                <td className="px-4 py-2 text-right">{pct(l.s.showRate)}</td>
                <td className="px-4 py-2 text-right">{l.s.sold}</td>
                <td className="px-4 py-2 text-right">{l.s.booked > 0 ? Math.round(l.calls / l.s.booked) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
