"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, TrendingUp, AlertTriangle, Phone, Calendar, Target, Clock, Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";

type DailyRow = { date: string; calls: number; meetings: number; stageChanges: number };
type Conversion = { totalCalls: number; totalMeetings: number; totalWon: number; totalLost: number; callToMeeting: string; meetingToWon: string };
type Fluff = { sessions: number; totalCalls: number; totalIdleSeconds: number; avgIdlePerCall: number };
type PipelineStage = { id: string; name: string; color: string; leadCount: number; totalValue: number };
type Seller = { id: string; name: string; calls: number; meetings: number; convRate: string; avgIdlePerCall: number; totalIdleMins: number; callsPerDay: number };
type Tab = "activity" | "forecasting" | "inefficiency";

function BarChart({ data, valueKey, color }: { data: DailyRow[]; valueKey: "calls" | "meetings"; color: string }) {
  const last14 = data.slice(-14);
  const max = Math.max(...last14.map((d) => d[valueKey]), 1);
  return (
    <div className="flex items-end gap-[3px] h-[80px]">
      {last14.map((d) => {
        const h = Math.max(Math.round((d[valueKey] / max) * 100), 4);
        const date = new Date(d.date);
        const label = date.toLocaleDateString("sv-SE", { weekday: "short" }).slice(0, 2);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        return (
          <div key={d.date} className="flex flex-col items-center gap-[3px] flex-1 group relative">
            <div
              className="w-full rounded-[3px] transition-all"
              style={{ height: `${h}%`, background: isWeekend ? "var(--border-strong)" : color, opacity: d[valueKey] === 0 ? 0.2 : 1, minHeight: "3px" }}
            />
            <span className="text-[8px]" style={{ color: "var(--text-dim)" }}>{label}</span>
            {d[valueKey] > 0 && (
              <div className="absolute bottom-full mb-1 px-2 py-1 text-[10px] rounded-[5px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity"
                style={{ background: "var(--text)", color: "var(--bg)" }}>
                {d[valueKey]} {valueKey === "calls" ? "samtal" : "möten"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-[16px]" style={{ background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
      <div className="w-8 h-8 rounded-[9px] flex items-center justify-center mb-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
        {icon}
      </div>
      <p className="text-[28px] font-bold tabular-nums leading-none mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</p>
      <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
      {sub && <p className="text-[11px] mt-[2px]" style={{ color: "var(--text-dim)" }}>{sub}</p>}
    </div>
  );
}

function PipelineFunnel({ stages }: { stages: PipelineStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.leadCount), 1);
  return (
    <div className="flex flex-col gap-2">
      {stages.map((stage) => {
        const pct = Math.round((stage.leadCount / maxCount) * 100);
        return (
          <div key={stage.id} className="flex items-center gap-3">
            <span className="text-[12px] font-medium w-[120px] text-right truncate" style={{ color: "var(--text)" }}>{stage.name}</span>
            <div className="flex-1 h-[28px] rounded-[6px] overflow-hidden" style={{ background: "var(--surface-inset)" }}>
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-[6px] flex items-center px-2"
                style={{ background: stage.color + "30", border: `1px solid ${stage.color}40` }}
              >
                {stage.leadCount > 0 && (
                  <span className="text-[11px] font-semibold" style={{ color: stage.color, fontFamily: "var(--font-mono)" }}>{stage.leadCount}</span>
                )}
              </motion.div>
            </div>
            {stage.totalValue > 0 && (
              <span className="text-[11px] w-[80px] text-right" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {stage.totalValue.toLocaleString("sv-SE")} kr
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StatsView({
  daily, conversion, fluff, pipeline, sellers, isAdmin,
}: {
  daily: DailyRow[]; conversion: Conversion; fluff: Fluff; pipeline: PipelineStage[]; sellers: Seller[]; isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("activity");

  const last7 = daily.slice(-7);
  const totalCallsWeek = last7.reduce((s, d) => s + d.calls, 0);
  const avgCalls = Math.round(totalCallsWeek / 7);
  const totalMeetingsWeek = last7.reduce((s, d) => s + d.meetings, 0);
  const totalPipelineLeads = pipeline.reduce((s, p) => s + p.leadCount, 0);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "activity",    label: "Aktivitet",   icon: <BarChart3 size={13} /> },
    { id: "forecasting", label: "Forecasting", icon: <TrendingUp size={13} /> },
    ...(isAdmin ? [{ id: "inefficiency" as Tab, label: "Ineffektivitet", icon: <AlertTriangle size={13} /> }] : []),
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-[52px] border-b shrink-0" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h1 className="text-[16px]" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>Statistik</h1>
        <div className="flex items-center gap-[2px] p-[3px] rounded-[10px]" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-[5px] px-3 py-[5px] text-[12px] font-medium rounded-[7px] transition-all duration-150"
              style={{
                background: tab === t.id ? "var(--surface)" : "transparent",
                color: tab === t.id ? "var(--text)" : "var(--text-dim)",
                boxShadow: tab === t.id ? "var(--shadow-xs)" : "none",
                border: tab === t.id ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        <div className="w-[120px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── Aktivitet ─────────────────────────────────────────────────── */}
          {tab === "activity" && (
            <motion.div key="activity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Samtal (7d)" value={totalCallsWeek} sub={`Snitt ${avgCalls}/dag`} icon={<Phone size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Möten (7d)" value={totalMeetingsWeek} icon={<Calendar size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Samtal → Möte" value={`${conversion.callToMeeting}%`} sub={`${conversion.totalCalls} tot`} icon={<Target size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Möte → Vunnet" value={`${conversion.meetingToWon}%`} sub={`${conversion.totalMeetings} möten`} icon={<Trophy size={14} style={{ color: "var(--text-muted)" }} />} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {[
                  { key: "calls" as const, label: "Samtal senaste 14 dagar", color: "var(--accent)" },
                  { key: "meetings" as const, label: "Möten bokade senaste 14 dagar", color: "var(--success)" },
                ].map(({ key, label, color }) => (
                  <div key={key} className="p-5 rounded-[18px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{label}</p>
                      <span className="text-[11px] px-2 py-[2px] rounded-full" style={{ background: "var(--surface-inset)", color: "var(--text-dim)" }}>
                        {daily.slice(-14).reduce((s, d) => s + d[key], 0)} tot
                      </span>
                    </div>
                    <BarChart data={daily} valueKey={key} color={color} />
                  </div>
                ))}
              </div>

              <div className="p-5 rounded-[18px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                <p className="text-[13px] font-semibold mb-5" style={{ color: "var(--text)" }}>Konverteringsfunnel</p>
                <div className="flex items-center gap-4">
                  {[
                    { label: "Samtal",    value: conversion.totalCalls,    color: "var(--text-muted)" },
                    { label: "Möten",     value: conversion.totalMeetings, color: "var(--info)" },
                    { label: "Vunna",     value: conversion.totalWon,      color: "var(--success)" },
                    { label: "Förlorade", value: conversion.totalLost,     color: "var(--danger)" },
                  ].map(({ label, value, color }, i, arr) => (
                    <div key={label} className="flex items-center gap-4 flex-1">
                      <div className="text-center flex-1">
                        <p className="text-[22px] font-bold tabular-nums" style={{ color, fontFamily: "var(--font-mono)" }}>{value}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</p>
                        {i > 0 && arr[i - 1].value > 0 && (
                          <p className="text-[10px] mt-1" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            {((value / arr[i - 1].value) * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                      {i < arr.length - 1 && <div className="text-[16px]" style={{ color: "var(--border-strong)" }}>→</div>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Forecasting ────────────────────────────────────────────────── */}
          {tab === "forecasting" && (
            <motion.div key="forecasting" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <KpiCard label="Aktiva leads" value={totalPipelineLeads} sub="I alla stadier" icon={<Target size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Pipeline value" value={`${pipeline.reduce((s, p) => s + p.totalValue, 0).toLocaleString("sv-SE")} kr`} sub="Vunna deals" icon={<TrendingUp size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Win rate" value={`${conversion.meetingToWon}%`} sub="Möte → Vunnet" icon={<Trophy size={14} style={{ color: "var(--text-muted)" }} />} />
              </div>

              <div className="p-5 rounded-[18px] mb-6" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                <p className="text-[13px] font-semibold mb-5" style={{ color: "var(--text)" }}>Pipeline per stadium</p>
                <PipelineFunnel stages={pipeline} />
              </div>

              <div className="p-5 rounded-[18px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                <p className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>Stadium-till-stadium konvertering</p>
                <div className="flex flex-col gap-3">
                  {pipeline.filter((_, i) => i < pipeline.length - 1).map((stage, i) => {
                    const next = pipeline[i + 1];
                    const rate = stage.leadCount > 0 ? ((next.leadCount / stage.leadCount) * 100).toFixed(0) : "—";
                    return (
                      <div key={stage.id} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-[120px]">
                          <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                          <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{stage.name}</span>
                        </div>
                        <div className="flex-1 h-[1px]" style={{ background: "var(--border)" }} />
                        <span className="text-[12px] font-semibold w-[48px] text-center" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{rate}{rate !== "—" ? "%" : ""}</span>
                        <div className="flex-1 h-[1px]" style={{ background: "var(--border)" }} />
                        <div className="flex items-center gap-2 w-[120px] justify-end">
                          <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{next.name}</span>
                          <div className="w-2 h-2 rounded-full" style={{ background: next.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Ineffektivitet ─────────────────────────────────────────────── */}
          {tab === "inefficiency" && isAdmin && (
            <motion.div key="inefficiency" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="p-6">
              {sellers.length === 0 ? (
                <div className="flex items-center justify-center py-24">
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Inga säljare med aktivitet ännu</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <KpiCard label="Aktiva säljare" value={sellers.length} icon={<Phone size={14} style={{ color: "var(--text-muted)" }} />} />
                    <KpiCard
                      label="Bäst konvertering"
                      value={sellers.reduce((b, s) => parseFloat(s.convRate) > parseFloat(b.convRate) ? s : b, sellers[0]).name}
                      sub={`${sellers.reduce((b, s) => parseFloat(s.convRate) > parseFloat(b.convRate) ? s : b, sellers[0]).convRate}% conv`}
                      icon={<Trophy size={14} style={{ color: "var(--text-muted)" }} />}
                    />
                    <KpiCard
                      label="Högst idle-tid"
                      value={sellers.reduce((w, s) => s.avgIdlePerCall > w.avgIdlePerCall ? s : w, sellers[0]).name}
                      sub={`${sellers.reduce((w, s) => s.avgIdlePerCall > w.avgIdlePerCall ? s : w, sellers[0]).avgIdlePerCall}s idle/samtal`}
                      icon={<Clock size={14} style={{ color: "var(--text-muted)" }} />}
                    />
                  </div>

                  <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: "var(--surface-inset)", borderBottom: "1px solid var(--border)" }}>
                          {["#", "Säljare", "Samtal (30d)", "Möten", "Konv", "Idle/samtal", "Total idle", "Samtal/dag"].map((h) => (
                            <th key={h} className="px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sellers.map((seller, i) => {
                          const teamAvg = sellers.reduce((s, sel) => s + parseFloat(sel.convRate), 0) / sellers.length;
                          const convFloat = parseFloat(seller.convRate);
                          const trend = convFloat > teamAvg ? "up" : convFloat < teamAvg ? "down" : "same";
                          return (
                            <tr key={seller.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i === 0 ? "var(--success-bg)" : "var(--surface)" }}>
                              <td className="px-4 py-3">
                                <span className="text-[13px] font-bold" style={{ color: i === 0 ? "var(--success)" : "var(--text-dim)", fontFamily: "var(--font-mono)" }}>#{i + 1}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                                    {seller.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{seller.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3"><span className="text-[13px] font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{seller.calls}</span></td>
                              <td className="px-4 py-3"><span className="text-[13px]" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{seller.meetings}</span></td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  {trend === "up"   && <ArrowUp   size={11} style={{ color: "var(--success)" }} />}
                                  {trend === "down" && <ArrowDown  size={11} style={{ color: "var(--danger)" }} />}
                                  {trend === "same" && <Minus      size={11} style={{ color: "var(--text-dim)" }} />}
                                  <span className="text-[13px] font-medium" style={{ color: trend === "up" ? "var(--success)" : trend === "down" ? "var(--danger)" : "var(--text)", fontFamily: "var(--font-mono)" }}>
                                    {seller.convRate}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[13px]" style={{ color: seller.avgIdlePerCall > 120 ? "var(--danger)" : seller.avgIdlePerCall > 60 ? "var(--warning)" : "var(--success)", fontFamily: "var(--font-mono)" }}>
                                  {seller.avgIdlePerCall}s
                                </span>
                              </td>
                              <td className="px-4 py-3"><span className="text-[13px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{seller.totalIdleMins}m</span></td>
                              <td className="px-4 py-3"><span className="text-[13px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{seller.callsPerDay}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
