"use client";

import { motion } from "framer-motion";
import { Phone, Calendar, Trophy, TrendingUp, Clock, BarChart2 } from "lucide-react";

type DayStat = { date: string; calls: number; meetings: number; stageChanges: number };
type ConversionRates = {
  totalCalls: number; totalMeetings: number; totalWon: number; totalLost: number;
  callToMeeting: string; meetingToWon: string;
};
type FluffStats = { sessions: number; totalCalls: number; totalIdleSeconds: number; avgIdlePerCall: number };
type PipelineStage = { id: string; name: string; color: string; leadCount: number; totalValue: number };

function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1 flex flex-col justify-end" style={{ height: "48px" }}>
      <div
        className="rounded-[3px] transition-all duration-500"
        style={{ height: `${Math.max(pct, 2)}%`, background: color, minHeight: value > 0 ? "3px" : "0" }}
      />
    </div>
  );
}

export function StatsView({
  daily, conversion, fluff, pipeline,
}: {
  daily: DayStat[];
  conversion: ConversionRates;
  fluff: FluffStats;
  pipeline: PipelineStage[];
}) {
  const last14 = daily.slice(-14);
  const maxCalls = Math.max(...last14.map((d) => d.calls), 1);
  const maxMeetings = Math.max(...last14.map((d) => d.meetings), 1);

  const todayStats = daily[daily.length - 1] ?? { calls: 0, meetings: 0 };
  const yesterdayStats = daily[daily.length - 2] ?? { calls: 0, meetings: 0 };

  const cards = [
    {
      label: "Samtal idag",
      value: todayStats.calls,
      sub: `${yesterdayStats.calls} igår`,
      icon: Phone,
      color: "var(--info)",
      bg: "var(--info-bg)",
    },
    {
      label: "Möten idag",
      value: todayStats.meetings,
      sub: `${yesterdayStats.meetings} igår`,
      icon: Calendar,
      color: "var(--accent)",
      bg: "var(--accent-muted)",
    },
    {
      label: "Totalt vunna",
      value: conversion.totalWon,
      sub: `${conversion.meetingToWon}% av möten`,
      icon: Trophy,
      color: "var(--warning)",
      bg: "var(--warning-bg)",
    },
    {
      label: "Samtal → Möte",
      value: `${conversion.callToMeeting}%`,
      sub: `${conversion.totalCalls} samtal totalt`,
      icon: TrendingUp,
      color: "var(--success)",
      bg: "var(--success-bg)",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-6 h-[56px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Statistik</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cards.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className="p-5 rounded-[16px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{c.label}</p>
                  <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: c.bg }}>
                    <c.icon size={15} style={{ color: c.color }} />
                  </div>
                </div>
                <p className="text-[28px] font-bold tracking-tight" style={{ color: "var(--text)" }}>{c.value}</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-dim)" }}>{c.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Activity chart + Pipeline */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">

            {/* 14-day bar chart */}
            <div className="p-5 rounded-[16px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>Aktivitet — 14 dagar</p>
              <div className="flex items-end gap-[3px]" style={{ height: "80px" }}>
                {last14.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-[2px]">
                    <div className="flex flex-col justify-end gap-[2px] w-full" style={{ height: "64px" }}>
                      <MiniBar value={day.meetings} max={maxMeetings} color="var(--accent)" />
                      <MiniBar value={day.calls} max={maxCalls} color="var(--info)" />
                    </div>
                    <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                      {new Date(day.date).getDate()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3">
                {[
                  { label: "Samtal", color: "var(--info)" },
                  { label: "Möten", color: "var(--accent)" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline overview */}
            <div className="p-5 rounded-[16px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>Pipeline</p>
              <div className="flex flex-col gap-3">
                {pipeline.map((s) => {
                  const maxCount = Math.max(...pipeline.map((p) => p.leadCount), 1);
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{s.name}</span>
                        </div>
                        <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{s.leadCount}</span>
                      </div>
                      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${(s.leadCount / maxCount) * 100}%`, background: s.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Fluff stats */}
          {fluff.totalCalls > 0 && (
            <div className="p-5 rounded-[16px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} style={{ color: "var(--text-muted)" }} />
                <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Fluff-tracking — senaste 7 dagarna</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Totala samtal", value: fluff.totalCalls },
                  { label: "Total idle-tid", value: formatSeconds(fluff.totalIdleSeconds) },
                  { label: "Avg idle / samtal", value: formatSeconds(fluff.avgIdlePerCall) },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 rounded-[10px]" style={{ background: "var(--surface-inset)" }}>
                    <p className="text-[22px] font-bold" style={{ color: "var(--text)" }}>{s.value}</p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
