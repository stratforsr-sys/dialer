"use client";

import { useMemo } from "react";
import {
  Phone, PhoneCall, PhoneMissed, CalendarCheck, Target, TrendingUp,
  BarChart3, Activity, Clock, Users, Zap, ArrowUp, ArrowDown,
  Calendar, CheckCircle2, Circle, Layers
} from "lucide-react";
import type { Contact, CallList } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface StatsViewProps {
  contacts: Contact[];
  callLists: CallList[];
  sessionCalls: number;
  sessionMeetings: number;
}

export function StatsView({ contacts, callLists, sessionCalls, sessionMeetings }: StatsViewProps) {
  // Calculate statistics
  const total = contacts.length;
  const worked = contacts.filter(c => c.status !== "ej_ringd").length;
  const queue = contacts.filter(c => c.status === "ej_ringd").length;
  const meetings = contacts.filter(c => c.status === "bokat_mote").length;
  const noAnswer = contacts.filter(c => c.status === "svarar_ej").length;
  const rejected = contacts.filter(c => c.status === "nej_tack").length;
  const interested = contacts.filter(c => c.status === "intresserad").length;
  const callbacks = contacts.filter(c => c.status === "atersam").length;
  const wrongNumber = contacts.filter(c => c.status === "fel_nummer").length;
  const busy = contacts.filter(c => c.status === "upptaget").length;
  const done = contacts.filter(c => c.status === "klar").length;

  const conversionRate = worked > 0 ? ((meetings / worked) * 100).toFixed(1) : "0";
  const answerRate = worked > 0 ? (((worked - noAnswer) / worked) * 100).toFixed(1) : "0";
  const interestRate = worked > 0 ? (((meetings + interested) / worked) * 100).toFixed(1) : "0";
  const pctDone = total > 0 ? Math.round((worked / total) * 100) : 0;

  // Aggregated stats
  const totalContacts = callLists.reduce((sum, list) => sum + list.contacts.length, 0);
  const totalCalls = callLists.reduce((sum, list) => sum + list.stats.totalCalls, 0) + sessionCalls;
  const totalMeetings = callLists.reduce((sum, list) => sum + list.stats.totalMeetings, 0) + sessionMeetings;

  // Sparkline data (simulated hourly breakdown)
  const hourlyData = useMemo(() => {
    return [2, 5, 8, 12, 7, 4, 9, 11, 6, 3, sessionCalls % 12 || 5, 8];
  }, [sessionCalls]);

  const statusData = [
    { status: "ej_ringd" as const, count: queue },
    { status: "bokat_mote" as const, count: meetings },
    { status: "intresserad" as const, count: interested },
    { status: "atersam" as const, count: callbacks },
    { status: "svarar_ej" as const, count: noAnswer },
    { status: "nej_tack" as const, count: rejected },
    { status: "upptaget" as const, count: busy },
    { status: "fel_nummer" as const, count: wrongNumber },
    { status: "klar" as const, count: done },
  ].filter(s => s.count > 0);

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-cockpit-surface border border-cockpit-border flex items-center justify-center">
              <BarChart3 size={18} className="text-cockpit-text-muted" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-cockpit-text tracking-tighter">Insikter</h1>
              <p className="text-sm text-cockpit-text-muted">Prestandaanalys & statistik</p>
            </div>
          </div>
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={Users}
            label="Kontakter"
            value={totalContacts}
            sublabel={`${callLists.length} listor`}
            delay={0}
          />
          <MetricCard
            icon={Phone}
            label="Samtal"
            value={totalCalls}
            sublabel={`${sessionCalls} idag`}
            accent
            delay={50}
          />
          <MetricCard
            icon={CalendarCheck}
            label="Möten"
            value={totalMeetings}
            sublabel={`${sessionMeetings} idag`}
            success
            delay={100}
          />
          <MetricCard
            icon={TrendingUp}
            label="Konvertering"
            value={`${conversionRate}%`}
            sublabel="möten/samtal"
            trend={parseFloat(conversionRate) > 5 ? "up" : "down"}
            delay={150}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4 mb-6">
          {/* Performance Metrics */}
          <div className="col-span-8 card p-6 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-cockpit-text-dim" />
                <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                  Prestanda
                </h3>
              </div>
              <span className="text-2xs text-cockpit-text-faint font-mono">aktiv lista</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <PerformanceGauge
                label="Svarsfrekvens"
                value={parseFloat(answerRate)}
                icon={PhoneCall}
                good={parseFloat(answerRate) > 50}
              />
              <PerformanceGauge
                label="Intressegrad"
                value={parseFloat(interestRate)}
                icon={Zap}
                good={parseFloat(interestRate) > 10}
              />
              <PerformanceGauge
                label="Framsteg"
                value={pctDone}
                icon={Target}
                good={pctDone > 30}
              />
            </div>

            {/* Hourly Activity Chart */}
            <div className="pt-4 border-t border-cockpit-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xs text-cockpit-text-dim uppercase tracking-wider">Timaktivitet</span>
                <span className="text-2xs text-cockpit-text-faint font-mono">senaste 12h</span>
              </div>
              <ActivityChart data={hourlyData} />
            </div>
          </div>

          {/* Daily Goal */}
          <div className="col-span-4 card p-6 animate-fade-up" style={{ animationDelay: "250ms" }}>
            <div className="flex items-center gap-2 mb-6">
              <Target size={14} className="text-cockpit-success" />
              <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                Dagens mål
              </h3>
            </div>

            <div className="flex flex-col items-center">
              <div className="relative mb-4">
                <svg className="w-32 h-32" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="var(--success)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min((sessionCalls / 50) * 264, 264)} 264`}
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold text-cockpit-text tabular-nums">
                    {Math.min(Math.round((sessionCalls / 50) * 100), 100)}%
                  </span>
                </div>
              </div>

              <p className="text-sm text-cockpit-text-muted mb-1">
                <span className="text-cockpit-text font-semibold">{sessionCalls}</span> / 50 samtal
              </p>

              {sessionCalls >= 50 && (
                <div className="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg bg-cockpit-success-bg border border-cockpit-success-border">
                  <CheckCircle2 size={12} className="text-cockpit-success" />
                  <span className="text-xs font-medium text-cockpit-success">Mål uppnått</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status & Lists Row */}
        <div className="grid grid-cols-12 gap-4 mb-6">
          {/* Status Distribution */}
          <div className="col-span-7 card p-6 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-cockpit-text-dim" />
                <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                  Statusfördelning
                </h3>
              </div>
              <span className="text-sm font-mono text-cockpit-text-muted tabular-nums">{total}</span>
            </div>

            <div className="space-y-3">
              {statusData.map(({ status, count }) => {
                const cfg = STATUS_CONFIG[status];
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-4">
                    <div className="w-28 flex items-center gap-2.5">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{ backgroundColor: `${cfg.color}15` }}
                      >
                        <cfg.icon size={11} style={{ color: cfg.color }} />
                      </div>
                      <span className="text-xs text-cockpit-text-muted truncate">
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-cockpit-border">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: cfg.color,
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 w-16 justify-end">
                      <span className="text-xs text-cockpit-text-muted font-mono tabular-nums">{count}</span>
                      <span className="text-2xs text-cockpit-text-faint font-mono tabular-nums w-8 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lists Overview */}
          <div className="col-span-5 card p-6 animate-fade-up" style={{ animationDelay: "350ms" }}>
            <div className="flex items-center gap-2 mb-6">
              <Calendar size={14} className="text-cockpit-text-dim" />
              <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
                Ringlistor
              </h3>
              <span className="ml-auto text-2xs text-cockpit-text-faint">{callLists.length} st</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {callLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-cockpit-text-dim">
                  <Layers size={24} className="mb-2 opacity-50" />
                  <span className="text-sm">Inga listor ännu</span>
                </div>
              ) : (
                callLists.map((list) => {
                  const listWorked = list.contacts.filter(c => c.status !== "ej_ringd").length;
                  const listPct = list.contacts.length > 0
                    ? Math.round((listWorked / list.contacts.length) * 100)
                    : 0;
                  const listMeetings = list.contacts.filter(c => c.status === "bokat_mote").length;

                  return (
                    <div
                      key={list.id}
                      className="p-3 rounded-lg bg-cockpit-bg-subtle border border-cockpit-border hover:border-cockpit-border-strong transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-cockpit-text truncate">{list.name}</span>
                        <span className="text-xs text-cockpit-text-dim font-mono">{list.contacts.length}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1 rounded-full overflow-hidden bg-cockpit-border">
                          <div
                            className="h-full rounded-full bg-cockpit-success transition-all duration-500"
                            style={{ width: `${listPct}%` }}
                          />
                        </div>
                        <span className="text-2xs text-cockpit-text-dim font-mono tabular-nums w-8">{listPct}%</span>
                      </div>
                      {listMeetings > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <CalendarCheck size={10} className="text-cockpit-success" />
                          <span className="text-2xs text-cockpit-success">{listMeetings} möten</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Session Summary */}
        <div className="card p-6 animate-fade-up" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center gap-2 mb-5">
            <Clock size={14} className="text-cockpit-text-dim" />
            <h3 className="text-xs font-semibold text-cockpit-text-dim uppercase tracking-wider">
              Dagens session
            </h3>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <SessionStat icon={Phone} label="Samtal" value={sessionCalls} />
            <SessionStat icon={CalendarCheck} label="Möten" value={sessionMeetings} success />
            <SessionStat icon={PhoneMissed} label="Ej svar" value={noAnswer} />
            <SessionStat icon={TrendingUp} label="Effektivitet" value={`${answerRate}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function MetricCard({ icon: Icon, label, value, sublabel, accent, success, trend, delay = 0 }: {
  icon: typeof Phone;
  label: string;
  value: number | string;
  sublabel: string;
  accent?: boolean;
  success?: boolean;
  trend?: "up" | "down";
  delay?: number;
}) {
  return (
    <div
      className="stat-module animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          success ? "bg-cockpit-success-bg" : accent ? "bg-cockpit-info-bg" : "bg-cockpit-surface-elevated"
        }`}>
          <Icon size={14} className={
            success ? "text-cockpit-success" : accent ? "text-cockpit-info" : "text-cockpit-text-muted"
          } />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 ${
            trend === "up" ? "text-cockpit-success" : "text-cockpit-danger"
          }`}>
            {trend === "up" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          </div>
        )}
      </div>
      <p className={`text-xl font-semibold tabular-nums tracking-tight ${
        success ? "text-cockpit-success" : accent ? "text-cockpit-info" : "text-cockpit-text"
      }`}>
        {value}
      </p>
      <p className="text-2xs text-cockpit-text-dim mt-0.5">{label}</p>
      <p className="text-2xs text-cockpit-text-faint">{sublabel}</p>
    </div>
  );
}

function PerformanceGauge({ label, value, icon: Icon, good }: {
  label: string;
  value: number;
  icon: typeof Phone;
  good: boolean;
}) {
  return (
    <div className="p-4 rounded-lg bg-cockpit-bg-subtle border border-cockpit-border">
      <div className="flex items-center justify-between mb-3">
        <div className="w-7 h-7 rounded-lg bg-cockpit-surface flex items-center justify-center">
          <Icon size={12} className="text-cockpit-text-muted" />
        </div>
        <div className={`w-2 h-2 rounded-full ${good ? "bg-cockpit-success" : "bg-cockpit-warning"}`} />
      </div>
      <p className="text-lg font-semibold text-cockpit-text tabular-nums">{value.toFixed(0)}%</p>
      <p className="text-2xs text-cockpit-text-dim mt-0.5">{label}</p>
    </div>
  );
}

function ActivityChart({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((val, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-cockpit-success transition-all duration-300 hover:opacity-80"
          style={{
            height: `${(val / max) * 100}%`,
            opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.4
          }}
        />
      ))}
    </div>
  );
}

function SessionStat({ icon: Icon, label, value, success }: {
  icon: typeof Phone;
  label: string;
  value: number | string;
  success?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-cockpit-bg-subtle border border-cockpit-border">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
        success ? "bg-cockpit-success-bg" : "bg-cockpit-surface"
      }`}>
        <Icon size={14} className={success ? "text-cockpit-success" : "text-cockpit-text-muted"} />
      </div>
      <div>
        <p className={`text-lg font-semibold tabular-nums ${
          success ? "text-cockpit-success" : "text-cockpit-text"
        }`}>
          {value}
        </p>
        <p className="text-2xs text-cockpit-text-dim">{label}</p>
      </div>
    </div>
  );
}
