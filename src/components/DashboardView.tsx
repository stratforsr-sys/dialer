"use client";

import {
  Phone, PhoneCall, PhoneMissed, CalendarCheck, Target, TrendingUp,
  Play, List, Users, ThumbsDown, Star, Clock, Zap, ArrowRight
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-telink-text tracking-tight mb-1">{listName}</h1>
            <p className="text-sm text-telink-muted">{total} kontakter • {queue} kvar i kö</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToList}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-telink-border bg-telink-surface hover:bg-telink-surface-hover hover:border-telink-border-light transition-all cursor-pointer text-telink-text"
            >
              <List size={15} /> Visa lista
            </button>
            <button
              onClick={onStartDialer}
              disabled={queue === 0}
              className="group flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#2bb574] text-white hover:shadow-[0_0_30px_rgba(43,181,116,0.35)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer animate-pulse-green"
            >
              <Play size={15} fill="currentColor" /> Starta Dialer
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="p-5 rounded-2xl bg-telink-surface border border-telink-border mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-telink-text">Listans framsteg</span>
            <span className="text-lg font-bold text-[#2bb574]">{pctDone}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-telink-surface-light">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${pctDone}%`,
                background: "linear-gradient(90deg, #2bb574, #2bb574)",
                boxShadow: "0 0 16px rgba(43,181,116,0.3)",
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-telink-dim">{worked} avklarade</span>
            <span className="text-xs text-telink-dim">{queue} kvar</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard icon={Phone} value={sessionCalls} label="Samtal idag" />
          <StatCard icon={CalendarCheck} value={meetings} label="Bokade möten" accent />
          <StatCard icon={PhoneMissed} value={noAnswer} label="Svarar ej" />
          <StatCard icon={TrendingUp} value={`${conversionRate}%`} label="Konvertering" />
        </div>

        {/* Daily goal + Status breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Daily goal */}
          <div className="p-5 rounded-2xl bg-telink-surface border border-telink-border">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[rgba(43,181,116,0.12)] flex items-center justify-center">
                <Target size={16} className="text-[#2bb574]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-telink-text">Dagens mål</div>
                <div className="text-xs text-telink-muted">{sessionCalls} / {dailyGoal} samtal</div>
              </div>
            </div>
            {/* Circular-ish gauge */}
            <div className="relative flex items-center justify-center py-4">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="#f0f1f4" strokeWidth="10" />
                <circle
                  cx="64" cy="64" r="56" fill="none" stroke="#2bb574" strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(goalPct / 100) * 352} 352`}
                  style={{ filter: "drop-shadow(0 0 6px rgba(43,181,116,0.4))", transition: "stroke-dasharray 1s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-telink-text">{goalPct}%</span>
                <span className="text-[10px] text-telink-muted font-medium">av målet</span>
              </div>
            </div>
            {goalPct >= 100 && (
              <div className="flex items-center justify-center gap-2 mt-2 p-2 rounded-lg bg-[rgba(43,181,116,0.1)]">
                <Zap size={14} className="text-[#2bb574]" />
                <span className="text-xs font-semibold text-[#2bb574]">Mål uppnått! 🎉</span>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          <div className="p-5 rounded-2xl bg-telink-surface border border-telink-border">
            <h3 className="text-sm font-semibold text-telink-text mb-4">Statusfördelning</h3>
            <div className="space-y-3">
              {([
                { status: "ej_ringd", count: queue },
                { status: "svarar_ej", count: noAnswer },
                { status: "bokat_mote", count: meetings },
                { status: "intresserad", count: interested },
                { status: "nej_tack", count: rejected },
                { status: "atersam", count: callbacks },
              ] as { status: keyof typeof STATUS_CONFIG; count: number }[]).map(({ status, count }) => {
                const cfg = STATUS_CONFIG[status];
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-medium truncate" style={{ color: cfg.color }}>
                      {cfg.label}
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-telink-surface-light">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: cfg.color, opacity: 0.7 }}
                      />
                    </div>
                    <span className="text-xs text-telink-muted font-mono w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-4">
          <QuickAction
            icon={Clock}
            title="Återsamtal"
            desc={`${callbacks} planerade`}
            onClick={onGoToList}
          />
          <QuickAction
            icon={Star}
            title="Intresserade"
            desc={`${interested} leads`}
            onClick={onGoToList}
          />
          <QuickAction
            icon={Users}
            title="Alla kontakter"
            desc={`${total} totalt`}
            onClick={onGoToList}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ icon: Icon, value, label, accent }: {
  icon: typeof Phone; value: number | string; label: string; accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 border transition-all duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: accent ? "rgba(43,181,116,0.06)" : "#ffffff",
        borderColor: accent ? "rgba(43,181,116,0.2)" : "#e2e5eb",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: accent ? "rgba(43,181,116,0.15)" : "#f0f1f4" }}
        >
          <Icon size={17} style={{ color: accent ? "#2bb574" : "#6b7a8d" }} />
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color: accent ? "#2bb574" : "#1a2233" }}>
            {value}
          </div>
          <div className="text-xs text-telink-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, desc, onClick }: {
  icon: typeof Phone; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group p-4 rounded-2xl bg-telink-surface border border-telink-border hover:border-telink-border-light hover:bg-telink-surface-hover transition-all text-left cursor-pointer"
    >
      <Icon size={18} className="text-telink-muted group-hover:text-[#2bb574] transition-colors mb-2" />
      <div className="text-sm font-semibold text-telink-text">{title}</div>
      <div className="text-xs text-telink-muted">{desc}</div>
    </button>
  );
}
