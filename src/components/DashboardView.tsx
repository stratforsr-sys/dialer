"use client";

import { useMemo, useState } from "react";
import {
  Phone, CalendarCheck, Play, List, ArrowRight,
  Activity, Zap, ChevronRight, TrendingUp, Target,
  BarChart2, RefreshCw,
} from "lucide-react";
import type { Contact, CallList, DayStats } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface DashboardViewProps {
  contacts: Contact[];
  sessionCalls: number;
  sessionMeetings: number;
  listName: string;
  onStartDialer: () => void;
  onGoToList: () => void;
  // Daily stats
  todayCalls: number;
  todayMeetings: number;
  dailyCallGoal: number;
  dailyMeetingGoal: number;
  last30Days: DayStats[];
  callLists: CallList[];
  activeListId: string | null;
}

type InsightTab = "aktivitet" | "konvertering" | "lista";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (dateStr === today) return "Idag";
  if (dateStr === yesterday) return "Igår";
  return d.toLocaleDateString("sv-SE", { weekday: "short" });
}

// ── Activity bar chart ──────────────────────────────
function ActivityChart({
  days,
  callLists,
  activeListId,
}: {
  days: DayStats[];
  callLists: CallList[];
  activeListId: string | null;
}) {
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Filter days by selected list
  const filtered = useMemo(() => {
    if (!selectedListId) return days;
    return days.map((d) => ({
      ...d,
      calls: d.byList?.[selectedListId] ?? 0,
      meetings: 0,
    }));
  }, [days, selectedListId]);

  const maxCalls = Math.max(...filtered.map((d) => d.calls), 1);
  const todayKey = new Date().toISOString().split("T")[0];
  const last7 = filtered.slice(-7);
  const weekTotal = last7.reduce((s, d) => s + d.calls, 0);
  const weekMeetings = last7.reduce((s, d) => s + d.meetings, 0);

  return (
    <div>
      {/* Week summary + list filter */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text)" }}>
              {weekTotal}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Senaste 7 dagarna</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--success)" }}>
              {weekMeetings}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Möten den veckan</p>
          </div>
        </div>

        {/* List filter */}
        <select
          value={selectedListId ?? ""}
          onChange={(e) => setSelectedListId(e.target.value || null)}
          className="text-xs px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <option value="">Alla listor</option>
          {callLists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Bar chart — last 30 days */}
      <div className="relative">
        <div className="flex items-end gap-[2px] h-28">
          {filtered.map((d, i) => {
            const isToday = d.date === todayKey;
            const callH = maxCalls > 0 ? (d.calls / maxCalls) * 100 : 0;
            const meetingH = d.calls > 0 ? (d.meetings / d.calls) * callH : 0;
            const isHovered = hoveredIdx === i;

            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end relative group cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Tooltip */}
                {isHovered && d.calls > 0 && (
                  <div
                    className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md text-2xs whitespace-nowrap pointer-events-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    {formatDate(d.date)}: {d.calls} samtal{d.meetings > 0 ? `, ${d.meetings} möten` : ""}
                  </div>
                )}

                {/* Bar */}
                <div
                  className="w-full rounded-t-sm relative overflow-hidden transition-opacity"
                  style={{
                    height: `${Math.max(callH, d.calls > 0 ? 2 : 0)}%`,
                    background: isToday ? "rgb(99,102,241)" : isHovered ? "var(--text-secondary)" : "var(--border-strong)",
                    opacity: d.calls === 0 ? 0.2 : 1,
                    minHeight: d.calls > 0 ? "2px" : "1px",
                  }}
                >
                  {/* Meeting overlay */}
                  {d.meetings > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-sm"
                      style={{ height: `${meetingH}%`, background: "var(--success)", opacity: 0.9 }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels — show every ~5 days */}
        <div className="flex gap-[2px] mt-1">
          {filtered.map((d, i) => {
            const showLabel = i === filtered.length - 1 || i === 0 || i % 7 === 0;
            return (
              <div key={d.date} className="flex-1 text-center">
                {showLabel && (
                  <span className="text-[9px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                    {formatDayLabel(d.date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--border-strong)" }} />
            <span className="text-2xs" style={{ color: "var(--text-muted)" }}>Samtal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--success)" }} />
            <span className="text-2xs" style={{ color: "var(--text-muted)" }}>Möten</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgb(99,102,241)" }} />
            <span className="text-2xs" style={{ color: "var(--text-muted)" }}>Idag</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Conversion section ──────────────────────────────
function ConversionSection({ contacts }: { contacts: Contact[] }) {
  const total = contacts.length;
  const meetings = contacts.filter((c) => c.status === "bokat_mote").length;
  const rejections = contacts.filter((c) => c.status === "nej_tack").length;
  const realCalls = meetings + rejections;

  const totalConv = total > 0 ? (meetings / total) * 100 : 0;
  const salesConv = realCalls > 0 ? (meetings / realCalls) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      <ConvCard
        label="Total konvertering"
        sublabel="Möten / alla kontakter i lista"
        value={totalConv}
        numerator={meetings}
        denominator={total}
        color="rgb(99,102,241)"
      />
      <ConvCard
        label="Säljkonvertering"
        sublabel="Möten / (Nej + Möten) — riktiga säljsamtal"
        value={salesConv}
        numerator={meetings}
        denominator={realCalls}
        color="var(--success)"
        highlight
      />

      {/* Breakdown */}
      <div
        className="col-span-2 rounded-xl p-4 text-xs grid grid-cols-3 gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-center">
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>{meetings}</p>
          <p style={{ color: "var(--text-muted)" }}>Bokade möten</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>{rejections}</p>
          <p style={{ color: "var(--text-muted)" }}>Nej tack</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>{realCalls}</p>
          <p style={{ color: "var(--text-muted)" }}>Riktiga säljsamtal</p>
        </div>
      </div>
    </div>
  );
}

function ConvCard({
  label, sublabel, value, numerator, denominator, color, highlight,
}: {
  label: string;
  sublabel: string;
  value: number;
  numerator: number;
  denominator: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--surface)",
        border: `1px solid ${highlight ? color : "var(--border)"}`,
      }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight mb-1" style={{ color }}>
        {value.toFixed(1)}<span className="text-lg">%</span>
      </p>
      <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      <p className="text-2xs" style={{ color: "var(--text-dim)" }}>
        {numerator} / {denominator} · {sublabel}
      </p>
    </div>
  );
}

// ── Lista tab (original content) ───────────────────
function ListaSection({
  contacts, sessionCalls, sessionMeetings, dailyCallGoal,
}: {
  contacts: Contact[];
  sessionCalls: number;
  sessionMeetings: number;
  dailyCallGoal: number;
}) {
  const total = contacts.length;
  const worked = contacts.filter((c) => c.status !== "ej_ringd").length;
  const queue = contacts.filter((c) => c.status === "ej_ringd").length;
  const meetings = contacts.filter((c) => c.status === "bokat_mote").length;
  const noAnswer = contacts.filter((c) => c.status === "svarar_ej").length;
  const callbacks = contacts.filter((c) => c.status === "atersam").length;
  const goalPct = Math.min(Math.round((sessionCalls / dailyCallGoal) * 100), 100);
  const convRate = worked > 0 ? ((meetings / worked) * 100).toFixed(1) : "0";

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Status breakdown */}
      <div className="col-span-5 rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</h3>
          <span className="text-2xs font-mono" style={{ color: "var(--text-dim)" }}>{total} totalt</span>
        </div>
        <div className="space-y-2">
          {([
            { status: "ej_ringd" as const, count: queue },
            { status: "bokat_mote" as const, count: meetings },
            { status: "svarar_ej" as const, count: noAnswer },
            { status: "atersam" as const, count: callbacks },
          ]).map(({ status, count }) => {
            const cfg = STATUS_CONFIG[status];
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={status} className="flex items-center gap-3 py-1">
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: `${cfg.color}18` }}>
                  <cfg.icon size={10} style={{ color: cfg.color }} />
                </div>
                <span className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>{cfg.label}</span>
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                </div>
                <span className="text-xs font-mono w-6 text-right tabular-nums" style={{ color: "var(--text-dim)" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Goal ring */}
      <div className="col-span-3 rounded-xl p-5 flex flex-col items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="relative">
          <svg className="w-28 h-28" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="4" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="var(--success)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(goalPct / 100) * 264} 264`}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--text)" }}>{sessionCalls}</span>
            <span className="text-2xs" style={{ color: "var(--text-dim)" }}>/{dailyCallGoal}</span>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>Sessionsmål</p>
        {goalPct >= 100 && (
          <div className="mt-2 px-2 py-1 rounded" style={{ background: "var(--success-bg)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <span className="text-2xs font-medium" style={{ color: "var(--success)" }}>Uppnått!</span>
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="col-span-4 rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={12} style={{ color: "var(--text-dim)" }} />
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Session</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--text)" }}>{sessionCalls}</p>
            <p className="text-2xs" style={{ color: "var(--text-dim)" }}>Samtal</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--success)" }}>{sessionMeetings}</p>
            <p className="text-2xs" style={{ color: "var(--text-dim)" }}>Möten</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--text)" }}>{convRate}%</p>
            <p className="text-2xs" style={{ color: "var(--text-dim)" }}>Konvertering</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--text)" }}>{queue}</p>
            <p className="text-2xs" style={{ color: "var(--text-dim)" }}>Kvar</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────
export function DashboardView({
  contacts, sessionCalls, sessionMeetings, listName, onStartDialer, onGoToList,
  todayCalls, todayMeetings, dailyCallGoal, dailyMeetingGoal,
  last30Days, callLists, activeListId,
}: DashboardViewProps) {
  const [insightTab, setInsightTab] = useState<InsightTab>("aktivitet");

  const total = contacts.length;
  const worked = contacts.filter((c) => c.status !== "ej_ringd").length;
  const queue = contacts.filter((c) => c.status === "ej_ringd").length;
  const pctDone = total > 0 ? Math.round((worked / total) * 100) : 0;

  const TABS: { key: InsightTab; label: string; icon: typeof BarChart2 }[] = [
    { key: "aktivitet", label: "Aktivitet", icon: BarChart2 },
    { key: "konvertering", label: "Konvertering", icon: TrendingUp },
    { key: "lista", label: "Lista", icon: List },
  ];

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-cockpit-success animate-pulse-subtle" />
              <span className="text-xs font-medium text-cockpit-text-dim uppercase tracking-wider">Aktiv lista</span>
            </div>
            <h1 className="text-2xl font-semibold text-cockpit-text tracking-tighter">{listName}</h1>
            <p className="text-sm text-cockpit-text-muted mt-1 font-mono">
              <span className="text-cockpit-text-secondary">{total}</span>
              <span className="text-cockpit-text-dim mx-1.5">/</span>
              <span className="text-cockpit-success">{queue}</span>
              <span className="text-cockpit-text-dim ml-1.5">kvar</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onGoToList} className="btn-secondary">
              <List size={14} /> Lista
            </button>
            <button onClick={onStartDialer} disabled={queue === 0} className="btn-primary group">
              <Play size={14} fill="currentColor" />
              Starta
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* Top 4 modules */}
        <div className="grid grid-cols-4 gap-3 mb-8 animate-fade-up" style={{ animationDelay: "50ms" }}>
          <TopModule label="Listprogress" value={`${pctDone}%`} sub="av listan klar" ring={pctDone} />
          <TopModule label="Idag" value={todayCalls} sub="samtal totalt" accent="indigo" />
          <TopModule label="Möten idag" value={todayMeetings} sub={`mål: ${dailyMeetingGoal}`} accent="green" />
          <TopModule label="Mål" value={`${todayCalls}/${dailyCallGoal}`} sub="samtal / dag" progress={Math.min((todayCalls / Math.max(dailyCallGoal, 1)) * 100, 100)} />
        </div>

        {/* Insight tabs */}
        <div className="flex items-center gap-1 mb-5 animate-fade-up" style={{ animationDelay: "100ms" }}>
          {TABS.map((tab) => {
            const active = insightTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setInsightTab(tab.key)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                style={{
                  background: active ? "var(--surface)" : undefined,
                  border: active ? "1px solid var(--border)" : "1px solid transparent",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  boxShadow: active ? "var(--shadow-sm)" : undefined,
                }}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="animate-fade-up" style={{ animationDelay: "150ms" }}>
          {insightTab === "aktivitet" && (
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-6">
                <BarChart2 size={14} style={{ color: "var(--text-muted)" }} />
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Aktivitet — senaste 30 dagarna</h3>
              </div>
              <ActivityChart days={last30Days} callLists={callLists} activeListId={activeListId} />
            </div>
          )}

          {insightTab === "konvertering" && (
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp size={14} style={{ color: "var(--text-muted)" }} />
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Konvertering — aktiv lista</h3>
              </div>
              <ConversionSection contacts={contacts} />
            </div>
          )}

          {insightTab === "lista" && (
            <ListaSection
              contacts={contacts}
              sessionCalls={sessionCalls}
              sessionMeetings={sessionMeetings}
              dailyCallGoal={dailyCallGoal}
            />
          )}
        </div>

        {/* Quick actions always visible */}
        <div className="grid grid-cols-3 gap-3 mt-6 animate-fade-up" style={{ animationDelay: "200ms" }}>
          <QuickAction icon={RefreshCw} label="Återsamtal" count={contacts.filter((c) => c.status === "atersam").length} onClick={onGoToList} />
          <QuickAction icon={Target} label="Dagsmål" count={todayCalls} sub={`/ ${dailyCallGoal}`} onClick={() => {}} />
          <QuickAction icon={Zap} label="Snabbstart" sub="Nästa samtal" onClick={onStartDialer} primary />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function TopModule({
  label, value, sub, ring, accent, progress,
}: {
  label: string;
  value: string | number;
  sub: string;
  ring?: number;
  accent?: "indigo" | "green";
  progress?: number;
}) {
  const accentColor = accent === "indigo" ? "rgb(99,102,241)" : accent === "green" ? "var(--success)" : "var(--text)";
  return (
    <div className="stat-module">
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xs font-semibold text-cockpit-text-dim uppercase tracking-wider">{label}</span>
        {ring !== undefined && (
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="none" stroke="var(--border)" strokeWidth="2" />
              <circle cx="16" cy="16" r="12" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${(ring / 100) * 75} 75`} transform="rotate(-90 16 16)" />
            </svg>
          </div>
        )}
        {progress !== undefined && (
          <div className="w-12 h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "rgb(99,102,241)" }} />
          </div>
        )}
      </div>
      <p className="text-xl font-semibold tabular-nums tracking-tight" style={{ color: accentColor || "var(--text)" }}>
        {value}
      </p>
      <p className="text-2xs text-cockpit-text-dim mt-0.5">{sub}</p>
    </div>
  );
}

function QuickAction({
  icon: Icon, label, count, sub, onClick, primary,
}: {
  icon: typeof Phone;
  label: string;
  count?: number;
  sub?: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`card-interactive p-4 text-left group ${primary ? "border-cockpit-success-border hover:border-cockpit-success" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            primary ? "bg-cockpit-success-bg group-hover:bg-cockpit-success text-cockpit-success group-hover:text-black"
              : "bg-cockpit-surface-elevated text-cockpit-text-muted"
          }`}>
            <Icon size={14} />
          </div>
          <div>
            <p className={`text-sm font-medium ${primary ? "text-cockpit-success" : "text-cockpit-text"}`}>{label}</p>
            <p className="text-2xs text-cockpit-text-dim">
              {count !== undefined ? `${count}${sub || " st"}` : sub}
            </p>
          </div>
        </div>
        <ChevronRight size={14} className="text-cockpit-text-dim group-hover:text-cockpit-text transition-colors" />
      </div>
    </button>
  );
}
