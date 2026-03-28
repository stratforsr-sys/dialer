"use client";

import {
  Phone, PhoneCall, PhoneMissed, CalendarCheck, Target, TrendingUp,
  Play, List, Users, Star, Clock, Zap, ArrowRight, Flame, Trophy
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
    <div className="h-full overflow-y-auto bg-telink-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Header with gradient accent */}
        <div className="flex items-start justify-between mb-10 animate-fade-up">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-2.5 py-1 rounded-lg bg-telink-accent-muted border border-telink-accent/20">
                <span className="text-2xs font-semibold text-telink-accent uppercase tracking-wider">Aktiv Lista</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-telink-text tracking-tight mb-2">{listName}</h1>
            <p className="text-sm text-telink-muted">
              <span className="text-telink-text-secondary font-medium">{total}</span> kontakter totalt
              <span className="mx-2 text-telink-dim">•</span>
              <span className="text-telink-accent font-medium">{queue}</span> kvar i kö
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToList}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-telink-border bg-telink-surface hover:bg-telink-surface-hover hover:border-telink-border-light transition-all cursor-pointer text-telink-text-secondary"
            >
              <List size={15} /> Visa lista
            </button>
            <button
              onClick={onStartDialer}
              disabled={queue === 0}
              className="group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-telink-accent via-pink-500 to-telink-violet text-telink-bg shadow-glow-md hover:shadow-glow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer animate-pulse-glow"
            >
              <Play size={15} fill="currentColor" /> Starta Dialer
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>
        </div>

        {/* Progress card with gradient */}
        <div className="relative p-6 rounded-3xl bg-telink-surface border border-telink-border mb-8 overflow-hidden animate-fade-up" style={{ animationDelay: "50ms" }}>
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-radial from-telink-accent/10 to-transparent rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-telink-accent/20 to-telink-violet/20 flex items-center justify-center">
                  <TrendingUp size={18} className="text-telink-accent" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-telink-text">Listans framsteg</span>
                  <p className="text-xs text-telink-muted">{worked} av {total} kontakter avklarade</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold gradient-text">{pctDone}%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-3 rounded-full overflow-hidden bg-telink-surface-elevated">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out-expo relative"
                style={{
                  width: `${pctDone}%`,
                  background: "linear-gradient(90deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%)",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-telink-dim">{worked} avklarade</span>
              <span className="text-xs text-telink-accent font-medium">{queue} kvar</span>
            </div>
          </div>
        </div>

        {/* Stat cards - Bento grid style */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard icon={Phone} value={sessionCalls} label="Samtal idag" delay="100ms" />
          <StatCard icon={CalendarCheck} value={meetings} label="Bokade möten" accent delay="150ms" />
          <StatCard icon={PhoneMissed} value={noAnswer} label="Svarar ej" delay="200ms" />
          <StatCard icon={TrendingUp} value={`${conversionRate}%`} label="Konvertering" delay="250ms" />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          {/* Daily goal - larger */}
          <div className="col-span-2 p-6 rounded-3xl bg-telink-surface border border-telink-border animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-telink-accent to-pink-500 flex items-center justify-center shadow-glow-sm">
                <Target size={18} className="text-telink-bg" />
              </div>
              <div>
                <div className="text-sm font-semibold text-telink-text">Dagens mål</div>
                <div className="text-xs text-telink-muted">{sessionCalls} / {dailyGoal} samtal</div>
              </div>
            </div>

            {/* Circular gauge */}
            <div className="relative flex items-center justify-center py-4">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="54" fill="none" stroke="#2a2433" strokeWidth="12" />
                <circle
                  cx="64" cy="64" r="54" fill="none"
                  stroke="url(#goalGradient)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(goalPct / 100) * 339} 339`}
                  style={{ transition: "stroke-dasharray 1s ease-out" }}
                />
                <defs>
                  <linearGradient id="goalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-telink-text">{goalPct}%</span>
                <span className="text-xs text-telink-muted font-medium">av målet</span>
              </div>
            </div>

            {goalPct >= 100 && (
              <div className="flex items-center justify-center gap-2 mt-4 p-3 rounded-xl bg-gradient-to-r from-telink-accent/10 to-telink-violet/10 border border-telink-accent/20">
                <Trophy size={16} className="text-telink-accent" />
                <span className="text-sm font-semibold gradient-text">Mål uppnått!</span>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          <div className="col-span-3 p-6 rounded-3xl bg-telink-surface border border-telink-border animate-fade-up" style={{ animationDelay: "350ms" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-telink-text">Statusfördelning</h3>
              <span className="text-xs text-telink-dim font-mono">{total} totalt</span>
            </div>
            <div className="space-y-4">
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
                  <div key={status} className="flex items-center gap-4">
                    <div className="w-24 flex items-center gap-2">
                      <cfg.icon size={12} style={{ color: cfg.color }} />
                      <span className="text-xs font-medium truncate" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-telink-surface-elevated">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: cfg.color,
                          boxShadow: `0 0 8px ${cfg.color}40`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-telink-muted font-mono w-10 text-right tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: "400ms" }}>
          <QuickAction
            icon={Clock}
            title="Återsamtal"
            desc={`${callbacks} planerade`}
            color="#3b82f6"
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
            icon={Flame}
            title="Starta Power Hour"
            desc="50 samtal, ingen paus"
            color="#f59e0b"
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
      className="rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-2 animate-fade-up"
      style={{
        animationDelay: delay,
        backgroundColor: accent ? "rgba(245, 158, 11, 0.08)" : "#1a1620",
        borderColor: accent ? "rgba(245, 158, 11, 0.2)" : "#2d2737",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            background: accent
              ? "linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(236,72,153,0.2) 100%)"
              : "#221d29"
          }}
        >
          <Icon size={18} style={{ color: accent ? "#f59e0b" : "#8b8492" }} />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: accent ? "#f59e0b" : "#faf8f5" }}>
            {value}
          </div>
          <div className="text-xs text-telink-muted">{label}</div>
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
        group p-5 rounded-2xl border transition-all duration-200 text-left cursor-pointer hover:-translate-y-1
        ${accent
          ? "bg-gradient-to-br from-telink-accent/10 to-telink-violet/10 border-telink-accent/20 hover:border-telink-accent/40"
          : "bg-telink-surface border-telink-border hover:border-telink-border-light hover:bg-telink-surface-hover"
        }
      `}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all group-hover:scale-110"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div className={`text-sm font-semibold mb-0.5 ${accent ? "text-telink-accent" : "text-telink-text"}`}>
        {title}
      </div>
      <div className="text-xs text-telink-muted">{desc}</div>
    </button>
  );
}
