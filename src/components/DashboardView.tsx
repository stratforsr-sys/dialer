"use client";

import {
  Phone, PhoneCall, PhoneMissed, CalendarCheck, Target, TrendingUp,
  Play, List, Star, Clock, ArrowRight
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
  const rejected = contacts.filter(c => c.status === "nej_tack").length;
  const interested = contacts.filter(c => c.status === "intresserad").length;
  const callbacks = contacts.filter(c => c.status === "atersam").length;
  const conversionRate = worked > 0 ? ((meetings / worked) * 100).toFixed(1) : "0";
  const pctDone = total > 0 ? Math.round((worked / total) * 100) : 0;

  const dailyGoal = 50;
  const goalPct = Math.min(Math.round((sessionCalls / dailyGoal) * 100), 100);

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 animate-fade-up">
          <div>
            <span className="text-2xs font-semibold text-cockpit-text-dim uppercase tracking-wider">Aktiv Lista</span>
            <h1 className="text-2xl font-semibold text-cockpit-text tracking-tight mt-1">{listName}</h1>
            <p className="text-sm text-cockpit-text-muted mt-1">
              <span className="font-medium text-cockpit-text-secondary">{total}</span> kontakter
              <span className="mx-2 text-cockpit-text-dim">·</span>
              <span className="font-medium text-cockpit-success">{queue}</span> kvar i kö
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToList}
              className="btn-secondary"
            >
              <List size={14} />
              Visa lista
            </button>
            <button
              onClick={onStartDialer}
              disabled={queue === 0}
              className="btn-primary"
            >
              <Play size={14} fill="currentColor" />
              Starta Dialer
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Progress card */}
        <div className="card p-5 mb-6 animate-fade-up" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
                <TrendingUp size={16} className="text-cockpit-text-muted" />
              </div>
              <div>
                <span className="text-sm font-medium text-cockpit-text">Listans framsteg</span>
                <p className="text-xs text-cockpit-text-muted">{worked} av {total} kontakter avklarade</p>
              </div>
            </div>
            <span className="text-2xl font-semibold text-cockpit-text tabular-nums">{pctDone}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full overflow-hidden bg-cockpit-bg-muted">
            <div
              className="h-full rounded-full bg-cockpit-success transition-all duration-700 ease-out"
              style={{ width: `${pctDone}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-2xs text-cockpit-text-dim">{worked} avklarade</span>
            <span className="text-2xs text-cockpit-success font-medium">{queue} kvar</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard icon={Phone} value={sessionCalls} label="Samtal idag" delay="100ms" />
          <StatCard icon={CalendarCheck} value={meetings} label="Bokade möten" accent delay="150ms" />
          <StatCard icon={PhoneMissed} value={noAnswer} label="Svarar ej" delay="200ms" />
          <StatCard icon={TrendingUp} value={`${conversionRate}%`} label="Konvertering" delay="250ms" />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {/* Daily goal */}
          <div className="col-span-2 card p-5 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-cockpit-success-bg flex items-center justify-center">
                <Target size={16} className="text-cockpit-success" />
              </div>
              <div>
                <div className="text-sm font-medium text-cockpit-text">Dagens mål</div>
                <div className="text-xs text-cockpit-text-muted">{sessionCalls} / {dailyGoal} samtal</div>
              </div>
            </div>

            {/* Circular gauge */}
            <div className="relative flex items-center justify-center py-2">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="54" fill="none" stroke="var(--bg-muted)" strokeWidth="8" />
                <circle
                  cx="64" cy="64" r="54" fill="none"
                  stroke="var(--success)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(goalPct / 100) * 339} 339`}
                  style={{ transition: "stroke-dasharray 1s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-cockpit-text tabular-nums">{goalPct}%</span>
                <span className="text-2xs text-cockpit-text-muted">av målet</span>
              </div>
            </div>

            {goalPct >= 100 && (
              <div className="flex items-center justify-center gap-2 mt-4 p-2.5 rounded-lg bg-cockpit-success-bg border border-cockpit-success/20">
                <span className="text-xs font-medium text-cockpit-success">Mål uppnått</span>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          <div className="col-span-3 card p-5 animate-fade-up" style={{ animationDelay: "350ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-cockpit-text">Statusfördelning</h3>
              <span className="text-2xs text-cockpit-text-dim font-mono tabular-nums">{total} totalt</span>
            </div>
            <div className="space-y-3">
              {([
                { status: "ej_ringd", count: queue },
                { status: "bokat_mote", count: meetings },
                { status: "intresserad", count: interested },
                { status: "svarar_ej", count: noAnswer },
                { status: "atersam", count: callbacks },
                { status: "nej_tack", count: rejected },
              ] as { status: keyof typeof STATUS_CONFIG; count: number }[]).map(({ status, count }) => {
                const cfg = STATUS_CONFIG[status];
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-20 flex items-center gap-2">
                      <cfg.icon size={11} style={{ color: cfg.color }} />
                      <span className="text-xs truncate" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-cockpit-bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: cfg.color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-cockpit-text-muted font-mono w-8 text-right tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3 animate-fade-up" style={{ animationDelay: "400ms" }}>
          <QuickAction
            icon={Clock}
            title="Återsamtal"
            desc={`${callbacks} planerade`}
            color="var(--info)"
            onClick={onGoToList}
          />
          <QuickAction
            icon={Star}
            title="Intresserade"
            desc={`${interested} leads`}
            color="#8b5cf6"
            onClick={onGoToList}
          />
          <QuickAction
            icon={Play}
            title="Snabbstart"
            desc="Starta nästa samtal"
            color="var(--success)"
            onClick={onStartDialer}
            accent
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ icon: Icon, value, label, accent, delay = "0ms" }: {
  icon: typeof Phone; value: number | string; label: string; accent?: boolean; delay?: string;
}) {
  return (
    <div
      className="card p-4 hover:shadow-card-hover transition-all duration-200 animate-fade-up"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            accent ? "bg-cockpit-success-bg" : "bg-cockpit-bg"
          }`}
        >
          <Icon size={15} className={accent ? "text-cockpit-success" : "text-cockpit-text-muted"} />
        </div>
        <div>
          <div className={`text-xl font-semibold tabular-nums ${accent ? "text-cockpit-success" : "text-cockpit-text"}`}>
            {value}
          </div>
          <div className="text-2xs text-cockpit-text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, desc, color, onClick, accent }: {
  icon: typeof Phone; title: string; desc: string; color: string; onClick: () => void; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        card-interactive p-4 text-left
        ${accent ? "border-cockpit-success/20 hover:border-cockpit-success/40" : ""}
      `}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: accent ? "var(--success-bg)" : `${color}15` }}
      >
        <Icon size={14} style={{ color: accent ? "var(--success)" : color }} />
      </div>
      <div className={`text-sm font-medium mb-0.5 ${accent ? "text-cockpit-success" : "text-cockpit-text"}`}>
        {title}
      </div>
      <div className="text-2xs text-cockpit-text-muted">{desc}</div>
    </button>
  );
}
