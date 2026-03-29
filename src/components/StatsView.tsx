"use client";

import {
  Phone, PhoneCall, PhoneMissed, CalendarCheck, Target, TrendingUp,
  BarChart3, PieChart, Activity, Clock, Users, Zap, ArrowUp, ArrowDown,
  Calendar, CheckCircle2, XCircle, AlertCircle
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
  // Calculate all statistics
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

  // Aggregated stats across all lists
  const totalContacts = callLists.reduce((sum, list) => sum + list.contacts.length, 0);
  const totalCalls = callLists.reduce((sum, list) => sum + list.stats.totalCalls, 0) + sessionCalls;
  const totalMeetings = callLists.reduce((sum, list) => sum + list.stats.totalMeetings, 0) + sessionMeetings;

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
  ];

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-6xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-cockpit-surface border border-cockpit-border flex items-center justify-center">
              <BarChart3 size={18} className="text-cockpit-text" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-cockpit-text tracking-tight">Statistik</h1>
              <p className="text-sm text-cockpit-text-muted">Översikt av alla dina ringlistor och prestationer</p>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <OverviewCard
            icon={Users}
            label="Totalt kontakter"
            value={totalContacts}
            subtext={`${callLists.length} listor`}
            delay="50ms"
          />
          <OverviewCard
            icon={Phone}
            label="Totalt samtal"
            value={totalCalls}
            subtext={`${sessionCalls} idag`}
            accent
            delay="100ms"
          />
          <OverviewCard
            icon={CalendarCheck}
            label="Bokade möten"
            value={totalMeetings}
            subtext={`${sessionMeetings} idag`}
            success
            delay="150ms"
          />
          <OverviewCard
            icon={TrendingUp}
            label="Konvertering"
            value={`${conversionRate}%`}
            subtext="möten/samtal"
            delay="200ms"
          />
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Performance Metrics */}
          <div className="col-span-2 card p-6 animate-fade-up" style={{ animationDelay: "250ms" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
                <Activity size={16} className="text-cockpit-text-muted" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-cockpit-text">Prestandamått</h3>
                <p className="text-xs text-cockpit-text-muted">Nyckeltal för aktiv lista</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Svarsfrekvens"
                value={`${answerRate}%`}
                icon={PhoneCall}
                trend={parseFloat(answerRate) > 50 ? "up" : "down"}
                description="Andel som svarar"
              />
              <MetricCard
                label="Intressegrad"
                value={`${interestRate}%`}
                icon={Zap}
                trend={parseFloat(interestRate) > 10 ? "up" : "down"}
                description="Möten + intresserade"
              />
              <MetricCard
                label="Framsteg"
                value={`${total > 0 ? Math.round((worked / total) * 100) : 0}%`}
                icon={Target}
                trend="up"
                description={`${worked}/${total} kontakter`}
              />
            </div>
          </div>

          {/* Daily Goal */}
          <div className="card p-6 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-cockpit-success-bg flex items-center justify-center">
                <Target size={16} className="text-cockpit-success" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-cockpit-text">Dagens mål</h3>
                <p className="text-xs text-cockpit-text-muted">{sessionCalls} / 50 samtal</p>
              </div>
            </div>

            <div className="relative flex items-center justify-center py-4">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="54" fill="none" stroke="var(--bg-muted)" strokeWidth="8" />
                <circle
                  cx="64" cy="64" r="54" fill="none"
                  stroke="var(--success)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min((sessionCalls / 50) * 339, 339)} 339`}
                  style={{ transition: "stroke-dasharray 1s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold text-cockpit-text tabular-nums">
                  {Math.min(Math.round((sessionCalls / 50) * 100), 100)}%
                </span>
                <span className="text-2xs text-cockpit-text-muted">av målet</span>
              </div>
            </div>

            {sessionCalls >= 50 && (
              <div className="flex items-center justify-center gap-2 mt-2 p-2 rounded-lg bg-cockpit-success-bg border border-cockpit-success/20">
                <CheckCircle2 size={12} className="text-cockpit-success" />
                <span className="text-xs font-medium text-cockpit-success">Mål uppnått!</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Distribution & Lists */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          {/* Status Distribution */}
          <div className="col-span-3 card p-6 animate-fade-up" style={{ animationDelay: "350ms" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
                  <PieChart size={16} className="text-cockpit-text-muted" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-cockpit-text">Statusfördelning</h3>
                  <p className="text-xs text-cockpit-text-muted">Alla statusar för aktiv lista</p>
                </div>
              </div>
              <span className="text-sm font-mono text-cockpit-text-muted tabular-nums">{total} totalt</span>
            </div>

            <div className="space-y-3">
              {statusData.filter(s => s.count > 0 || s.status === "ej_ringd").map(({ status, count }) => {
                const cfg = STATUS_CONFIG[status];
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-4">
                    <div className="w-28 flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${cfg.color}15` }}
                      >
                        <cfg.icon size={12} style={{ color: cfg.color }} />
                      </div>
                      <span className="text-xs font-medium text-cockpit-text-secondary truncate">
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-cockpit-bg-muted">
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
                      <span className="text-2xs text-cockpit-text-dim font-mono tabular-nums">
                        ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* List Overview */}
          <div className="col-span-2 card p-6 animate-fade-up" style={{ animationDelay: "400ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
                <Calendar size={16} className="text-cockpit-text-muted" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-cockpit-text">Dina listor</h3>
                <p className="text-xs text-cockpit-text-muted">{callLists.length} ringlistor</p>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {callLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-cockpit-text-dim">
                  <AlertCircle size={24} className="mb-2" />
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
                      className="p-3 rounded-lg bg-cockpit-bg hover:bg-cockpit-bg-subtle transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-cockpit-text truncate">{list.name}</span>
                        <span className="text-xs text-cockpit-text-muted">{list.contacts.length} st</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-cockpit-bg-muted">
                          <div
                            className="h-full rounded-full bg-cockpit-success transition-all duration-500"
                            style={{ width: `${listPct}%` }}
                          />
                        </div>
                        <span className="text-2xs text-cockpit-text-muted font-mono tabular-nums">{listPct}%</span>
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
        <div className="card p-6 animate-fade-up" style={{ animationDelay: "450ms" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
              <Clock size={16} className="text-cockpit-text-muted" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-cockpit-text">Dagens session</h3>
              <p className="text-xs text-cockpit-text-muted">Sammanfattning av dagens aktivitet</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <SessionStat icon={Phone} label="Samtal" value={sessionCalls} />
            <SessionStat icon={CalendarCheck} label="Möten" value={sessionMeetings} success />
            <SessionStat icon={PhoneMissed} label="Inget svar" value={noAnswer} />
            <SessionStat icon={XCircle} label="Avböjt" value={rejected} danger />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function OverviewCard({ icon: Icon, label, value, subtext, accent, success, delay = "0ms" }: {
  icon: typeof Phone;
  label: string;
  value: number | string;
  subtext: string;
  accent?: boolean;
  success?: boolean;
  delay?: string;
}) {
  return (
    <div
      className="card p-5 animate-fade-up"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          success ? "bg-cockpit-success-bg" : accent ? "bg-cockpit-info-bg" : "bg-cockpit-bg"
        }`}>
          <Icon size={18} className={
            success ? "text-cockpit-success" : accent ? "text-cockpit-info" : "text-cockpit-text-muted"
          } />
        </div>
      </div>
      <div className={`text-2xl font-semibold tabular-nums mb-1 ${
        success ? "text-cockpit-success" : accent ? "text-cockpit-info" : "text-cockpit-text"
      }`}>
        {value}
      </div>
      <div className="text-xs text-cockpit-text-muted">{label}</div>
      <div className="text-2xs text-cockpit-text-dim mt-1">{subtext}</div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, trend, description }: {
  label: string;
  value: string;
  icon: typeof Phone;
  trend: "up" | "down";
  description: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-cockpit-bg border border-cockpit-border">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-cockpit-surface flex items-center justify-center">
          <Icon size={14} className="text-cockpit-text-muted" />
        </div>
        <div className={`flex items-center gap-1 ${
          trend === "up" ? "text-cockpit-success" : "text-cockpit-danger"
        }`}>
          {trend === "up" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </div>
      </div>
      <div className="text-xl font-semibold text-cockpit-text tabular-nums">{value}</div>
      <div className="text-xs text-cockpit-text-muted mt-1">{label}</div>
      <div className="text-2xs text-cockpit-text-dim mt-0.5">{description}</div>
    </div>
  );
}

function SessionStat({ icon: Icon, label, value, success, danger }: {
  icon: typeof Phone;
  label: string;
  value: number;
  success?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-cockpit-bg">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
        success ? "bg-cockpit-success-bg" : danger ? "bg-cockpit-danger-bg" : "bg-cockpit-surface"
      }`}>
        <Icon size={14} className={
          success ? "text-cockpit-success" : danger ? "text-cockpit-danger" : "text-cockpit-text-muted"
        } />
      </div>
      <div>
        <div className={`text-lg font-semibold tabular-nums ${
          success ? "text-cockpit-success" : danger ? "text-cockpit-danger" : "text-cockpit-text"
        }`}>
          {value}
        </div>
        <div className="text-2xs text-cockpit-text-muted">{label}</div>
      </div>
    </div>
  );
}
