"use client";

import { useMemo } from "react";
import {
  Phone, CalendarCheck, TrendingUp, Play, List, ArrowRight,
  Activity, Zap, Clock, ChevronRight, Circle
} from "lucide-react";
import type { Contact } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface DashboardViewProps {
  contacts: Contact[];
  sessionCalls: number;
  sessionMeetings: number;
  listName: string;
  onStartDialer: () => void;
  onGoToList: () => void;
}

export function DashboardView({
  contacts, sessionCalls, sessionMeetings, listName, onStartDialer, onGoToList
}: DashboardViewProps) {
  const total = contacts.length;
  const worked = contacts.filter(c => c.status !== "ej_ringd").length;
  const queue = contacts.filter(c => c.status === "ej_ringd").length;
  const meetings = contacts.filter(c => c.status === "bokat_mote").length;
  const noAnswer = contacts.filter(c => c.status === "svarar_ej").length;
  const interested = contacts.filter(c => c.status === "intresserad").length;
  const callbacks = contacts.filter(c => c.status === "atersam").length;
  const connectRate = worked > 0 ? Math.round(((worked - noAnswer) / worked) * 100) : 0;
  const conversionRate = worked > 0 ? ((meetings / worked) * 100).toFixed(1) : "0";
  const pctDone = total > 0 ? Math.round((worked / total) * 100) : 0;

  const dailyGoal = 50;
  const goalPct = Math.min(Math.round((sessionCalls / dailyGoal) * 100), 100);

  // Simulate sparkline data (last 7 data points for velocity)
  const sparklineData = useMemo(() => {
    return [3, 5, 4, 7, 6, 8, sessionCalls % 10 || 2];
  }, [sessionCalls]);

  // Activity log entries (simulated recent activity)
  const activityLog = useMemo(() => {
    const now = new Date();
    return [
      { time: formatTime(now), event: "Session started", type: "info" },
      { time: formatTime(new Date(now.getTime() - 120000)), event: `${sessionCalls} samtal`, type: "neutral" },
      { time: formatTime(new Date(now.getTime() - 240000)), event: `${meetings} möten bokade`, type: "success" },
    ];
  }, [sessionCalls, meetings]);

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-cockpit-success animate-pulse-subtle" />
              <span className="text-xs font-medium text-cockpit-text-dim uppercase tracking-wider">
                Aktiv Session
              </span>
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
              <List size={14} />
              Lista
            </button>
            <button
              onClick={onStartDialer}
              disabled={queue === 0}
              className="btn-primary group"
            >
              <Play size={14} fill="currentColor" />
              Starta
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* Momentum Header - 4 precision modules */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MomentumModule
            label="Health"
            value={`${pctDone}%`}
            sublabel="av listan"
            type="ring"
            ringValue={pctDone}
            delay={0}
          />
          <MomentumModule
            label="Velocity"
            value={sessionCalls}
            sublabel="samtal/h"
            type="sparkline"
            sparklineData={sparklineData}
            delay={50}
          />
          <MomentumModule
            label="Connect"
            value={`${connectRate}%`}
            sublabel="svarsfrekvens"
            type="metric"
            trend={connectRate > 50 ? "up" : "down"}
            delay={100}
          />
          <MomentumModule
            label="Mål"
            value={`${sessionMeetings}/${Math.ceil(dailyGoal * 0.1)}`}
            sublabel="möten idag"
            type="progress"
            progressValue={goalPct}
            delay={150}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4 mb-6">
          {/* Left: Status Breakdown */}
          <div className="col-span-5 card p-5 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                Status
              </h3>
              <span className="text-2xs font-mono text-cockpit-text-faint">{total} totalt</span>
            </div>
            <div className="space-y-2">
              {([
                { status: "ej_ringd" as const, count: queue },
                { status: "bokat_mote" as const, count: meetings },
                { status: "intresserad" as const, count: interested },
                { status: "svarar_ej" as const, count: noAnswer },
                { status: "atersam" as const, count: callbacks },
              ]).map(({ status, count }) => {
                const cfg = STATUS_CONFIG[status];
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <StatusRow
                    key={status}
                    icon={cfg.icon}
                    label={cfg.label}
                    count={count}
                    pct={pct}
                    color={cfg.color}
                  />
                );
              })}
            </div>
          </div>

          {/* Center: Daily Goal Ring */}
          <div className="col-span-3 card p-5 flex flex-col items-center justify-center animate-fade-up" style={{ animationDelay: "250ms" }}>
            <div className="relative">
              <svg className="w-28 h-28" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="4"
                />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(goalPct / 100) * 264} 264`}
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold text-cockpit-text tabular-nums">{sessionCalls}</span>
                <span className="text-2xs text-cockpit-text-dim">/{dailyGoal}</span>
              </div>
            </div>
            <p className="text-xs text-cockpit-text-muted mt-3">Dagens mål</p>
            {goalPct >= 100 && (
              <div className="mt-2 px-2 py-1 rounded bg-cockpit-success-bg border border-cockpit-success-border">
                <span className="text-2xs font-medium text-cockpit-success">Uppnått</span>
              </div>
            )}
          </div>

          {/* Right: Activity Log */}
          <div className="col-span-4 card p-5 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={12} className="text-cockpit-text-dim" />
              <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                Aktivitet
              </h3>
            </div>
            <div className="activity-log">
              {activityLog.map((entry, i) => (
                <div key={i} className="activity-log-item">
                  <span className="activity-log-time">{entry.time}</span>
                  <Circle
                    size={4}
                    className={
                      entry.type === "success" ? "text-cockpit-success fill-cockpit-success" :
                      entry.type === "info" ? "text-cockpit-info fill-cockpit-info" :
                      "text-cockpit-text-dim fill-cockpit-text-dim"
                    }
                  />
                  <span className="activity-log-event">{entry.event}</span>
                </div>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="mt-4 pt-4 border-t border-cockpit-border grid grid-cols-2 gap-3">
              <div>
                <p className="text-lg font-semibold text-cockpit-text tabular-nums">{conversionRate}%</p>
                <p className="text-2xs text-cockpit-text-dim">Konvertering</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-cockpit-success tabular-nums">{meetings}</p>
                <p className="text-2xs text-cockpit-text-dim">Bokade</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 animate-fade-up" style={{ animationDelay: "350ms" }}>
          <QuickAction
            icon={Clock}
            label="Återsamtal"
            count={callbacks}
            onClick={onGoToList}
          />
          <QuickAction
            icon={Zap}
            label="Intresserade"
            count={interested}
            onClick={onGoToList}
            accent
          />
          <QuickAction
            icon={Play}
            label="Snabbstart"
            sublabel="Nästa samtal"
            onClick={onStartDialer}
            primary
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function MomentumModule({
  label,
  value,
  sublabel,
  type,
  ringValue,
  sparklineData,
  trend,
  progressValue,
  delay = 0
}: {
  label: string;
  value: string | number;
  sublabel: string;
  type: "ring" | "sparkline" | "metric" | "progress";
  ringValue?: number;
  sparklineData?: number[];
  trend?: "up" | "down";
  progressValue?: number;
  delay?: number;
}) {
  return (
    <div
      className="stat-module animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
          {label}
        </span>
        {type === "ring" && ringValue !== undefined && (
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="none" stroke="var(--border)" strokeWidth="2" />
              <circle
                cx="16" cy="16" r="12" fill="none"
                stroke="var(--success)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${(ringValue / 100) * 75} 75`}
                transform="rotate(-90 16 16)"
              />
            </svg>
          </div>
        )}
        {type === "sparkline" && sparklineData && (
          <Sparkline data={sparklineData} />
        )}
        {type === "metric" && trend && (
          <div className={`flex items-center gap-1 text-2xs ${
            trend === "up" ? "text-cockpit-success" : "text-cockpit-danger"
          }`}>
            <TrendingUp size={10} className={trend === "down" ? "rotate-180" : ""} />
          </div>
        )}
        {type === "progress" && progressValue !== undefined && (
          <div className="w-12 h-1.5 rounded-full bg-cockpit-border overflow-hidden">
            <div
              className="h-full bg-cockpit-success rounded-full transition-all duration-500"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        )}
      </div>
      <p className="text-xl font-semibold text-cockpit-text tabular-nums tracking-tight">{value}</p>
      <p className="text-2xs text-cockpit-text-dim mt-0.5">{sublabel}</p>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="sparkline">
      {data.map((val, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{
            height: `${(val / max) * 100}%`,
            opacity: i === data.length - 1 ? 1 : 0.5
          }}
        />
      ))}
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  count,
  pct,
  color
}: {
  icon: typeof Phone;
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={10} style={{ color }} />
      </div>
      <span className="text-xs text-cockpit-text-muted flex-1">{label}</span>
      <div className="w-16 h-1 rounded-full bg-cockpit-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono text-cockpit-text-dim w-6 text-right tabular-nums">{count}</span>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  count,
  sublabel,
  onClick,
  accent,
  primary
}: {
  icon: typeof Phone;
  label: string;
  count?: number;
  sublabel?: string;
  onClick: () => void;
  accent?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        card-interactive p-4 text-left group
        ${primary ? "border-cockpit-success-border hover:border-cockpit-success" : ""}
        ${accent ? "border-cockpit-accent-muted" : ""}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              primary ? "bg-cockpit-success-bg group-hover:bg-cockpit-success text-cockpit-success group-hover:text-black" :
              accent ? "bg-cockpit-accent-muted text-cockpit-success" :
              "bg-cockpit-surface-elevated text-cockpit-text-muted"
            }`}
          >
            <Icon size={14} />
          </div>
          <div>
            <p className={`text-sm font-medium ${primary ? "text-cockpit-success" : "text-cockpit-text"}`}>
              {label}
            </p>
            <p className="text-2xs text-cockpit-text-dim">
              {count !== undefined ? `${count} st` : sublabel}
            </p>
          </div>
        </div>
        <ChevronRight size={14} className="text-cockpit-text-dim group-hover:text-cockpit-text transition-colors" />
      </div>
    </button>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
