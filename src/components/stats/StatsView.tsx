"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Handshake, AlertTriangle, Phone, Calendar, Target, Clock, Trophy, ArrowUp, ArrowDown, Minus, Repeat, Undo2 } from "lucide-react";

type DailyRow = { date: string; calls: number; connected: number; sold: number };
type Conversion = { totalCalls: number; connected: number; reachedDm: number; totalSold: number; callbacks: number; connectRate: string; dmRate: string; closeRate: string; dmToClose: string };
type Fluff = { sessions: number; totalCalls: number; totalIdleSeconds: number; avgIdlePerCall: number };
type DealRecent = {
  id: string; leadId: string; companyName: string; contactName: string | null;
  value: number | null; valueType: string; status: string; closedAt: Date | string; seller: string;
};
type DealsOverview = {
  days: number; count: number; cancelled: number;
  oneTimeTotal: number; monthlyTotal: number; recent: DealRecent[];
};
type Seller = { id: string; name: string; calls: number; sold: number; convRate: string; avgIdlePerCall: number; totalIdleMins: number; callsPerDay: number };
type Tab = "activity" | "deals" | "inefficiency";

function BarChart({ data, valueKey, color }: { data: DailyRow[]; valueKey: "calls" | "sold"; color: string }) {
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
              className="w-full rounded-sm transition-all"
              style={{ height: `${h}%`, background: isWeekend ? "var(--border-strong)" : color, opacity: d[valueKey] === 0 ? 0.2 : 1, minHeight: "3px" }}
            />
            <span className="text-[8px]" style={{ color: "var(--text-dim)" }}>{label}</span>
            {d[valueKey] > 0 && (
              <div className="absolute bottom-full mb-1 px-2 py-1 text-[10px] rounded-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity"
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
    <div className="p-4 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="w-8 h-8 rounded-md flex items-center justify-center mb-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
        {icon}
      </div>
      <p className="text-[28px] font-bold tabular-nums leading-none mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</p>
      <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
      {sub && <p className="text-[11px] mt-[2px]" style={{ color: "var(--text-dim)" }}>{sub}</p>}
    </div>
  );
}

function money(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 });
}

/**
 * Senaste avsluten.
 *
 * Ersätter pipeline-tratten. Tratten ritade fem stadier med allt innehåll i
 * ett av dem — det finns inga stadier i one call close, bara samtal som blev
 * affärer och samtal som inte blev det. Konverteringen mäts i Aktivitet, där
 * den hör hemma; här står vad som faktiskt såldes.
 */
function RecentDeals({ deals }: { deals: DealRecent[] }) {
  const router = useRouter();

  if (deals.length === 0) {
    return (
      <p className="text-[13px] py-6 text-center" style={{ color: "var(--text-dim)" }}>
        Inga affärer i perioden.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {deals.map((d) => {
        const cancelled = d.status === "LOST";
        return (
          <button
            key={d.id}
            onClick={() => router.push(`/deals/${d.id}`)}
            className="flex items-center gap-3 px-1 py-[9px] text-left"
            style={{ borderTop: "1px solid var(--border-subtle)", opacity: cancelled ? 0.55 : 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="text-[11px] mono-nums shrink-0" style={{ color: "var(--text-dim)", minWidth: 74 }}>
              {new Date(d.closedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
            </span>

            <span
              className="text-[13px] font-medium flex-1 truncate"
              style={{ color: "var(--text)", textDecoration: cancelled ? "line-through" : "none" }}
            >
              {d.companyName}
            </span>

            {cancelled && (
              <Undo2 size={11} className="shrink-0" style={{ color: "var(--danger)" }} />
            )}

            <span className="text-[11px] truncate hidden lg:block" style={{ color: "var(--text-dim)", width: 120 }}>
              {d.seller}
            </span>

            <span className="flex items-center gap-1 text-[13px] font-semibold mono-nums shrink-0" style={{ color: "var(--text)" }}>
              {d.value != null ? `${money(d.value)} kr` : "—"}
              {d.valueType === "MONTHLY" && <Repeat size={10} style={{ color: "var(--text-dim)" }} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StatsView({
  daily, conversion, fluff, deals, sellers, isAdmin, sellerFilter,
}: {
  daily: DailyRow[]; conversion: Conversion; fluff: Fluff; deals: DealsOverview; sellers: Seller[]; isAdmin: boolean;
  /** Vald säljare, eller null för hela golvet. Alltid null för säljare —
   *  servern struntar i parametern för dem, så den ska inte visas heller. */
  sellerFilter: string | null;
}) {
  const [tab, setTab] = useState<Tab>("activity");
  const router = useRouter();

  const last7 = daily.slice(-7);
  const totalCallsWeek = last7.reduce((s, d) => s + d.calls, 0);
  const avgCalls = Math.round(totalCallsWeek / 7);
  const totalSoldWeek = last7.reduce((s, d) => s + d.sold, 0);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "activity",    label: "Aktivitet",   icon: <BarChart3 size={13} /> },
    { id: "deals",       label: "Affärer",     icon: <Handshake size={13} /> },
    ...(isAdmin ? [{ id: "inefficiency" as Tab, label: "Ineffektivitet", icon: <AlertTriangle size={13} /> }] : []),
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-[52px] border-b shrink-0" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h1 className="text-[16px]" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Statistik</h1>
        <div className="flex items-center gap-[2px] p-[3px] rounded-md" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-[5px] px-3 py-[5px] text-[12px] font-medium rounded-sm transition-all duration-150"
              style={{
                background: tab === t.id ? "var(--surface)" : "transparent",
                color: tab === t.id ? "var(--text)" : "var(--text-dim)",
                boxShadow: tab === t.id ? "var(--shadow-1)" : "none",
                border: tab === t.id ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {/* Filtret hamnar i motvikten som redan fanns för att centrera
            flikarna. Säljare ser den aldrig — servern ignorerar parametern
            för dem, och en väljare som inte gör något är värre än ingen. */}
        {isAdmin && sellers.length > 0 ? (
          <div className="w-[180px] flex justify-end">
            <select
              value={sellerFilter ?? "all"}
              onChange={(e) => {
                const v = e.target.value;
                router.push(v === "all" ? "/stats" : `/stats?seller=${encodeURIComponent(v)}`);
              }}
              className="px-2 py-[5px] text-[12px] max-w-full"
              title="Filtrera statistiken på en säljare"
            >
              <option value="all">Alla säljare</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="w-[120px]" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── Aktivitet ─────────────────────────────────────────────────── */}
          {tab === "activity" && (
            <motion.div key="activity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-4 mb-6">
                <KpiCard label="Samtal (7d)" value={totalCallsWeek} sub={`Snitt ${avgCalls}/dag`} icon={<Phone size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Sålt (7d)" value={totalSoldWeek} icon={<Calendar size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Svarsfrekvens" value={`${conversion.connectRate}%`} sub={`${conversion.totalCalls} samtal`} icon={<Target size={14} style={{ color: "var(--text-muted)" }} />} />
                <KpiCard label="Nådd DM → Såld" value={`${conversion.dmToClose}%`} sub={`${conversion.reachedDm} nådda`} icon={<Trophy size={14} style={{ color: "var(--text-muted)" }} />} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {[
                  { key: "calls" as const, label: "Samtal senaste 14 dagar", color: "var(--accent)" },
                  { key: "sold" as const, label: "Avslut senaste 14 dagar", color: "var(--success)" },
                ].map(({ key, label, color }) => (
                  <div key={key} className="p-5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
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

              <div className="p-5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-[13px] font-semibold mb-5" style={{ color: "var(--text)" }}>Konverteringsfunnel</p>
                <div className="flex items-center gap-4">
                  {[
                    { label: "Samtal",    value: conversion.totalCalls,    color: "var(--text-muted)" },
                    { label: "Nådde DM",  value: conversion.reachedDm, color: "var(--info)" },
                    { label: "Sålt",      value: conversion.totalSold,     color: "var(--success)" },
                    { label: "Återkomst", value: conversion.callbacks,     color: "var(--warning)" },
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

          {/* ── Affärer ───────────────────────────────────────────────────── */}
          {tab === "deals" && (
            <motion.div key="deals" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard
                  label="Affärer"
                  value={deals.count}
                  sub={`Senaste ${deals.days} dagarna`}
                  icon={<Handshake size={14} style={{ color: "var(--text-muted)" }} />}
                />
                {/* Två summor, aldrig en. Engångsintäkt och månadsintäkt är
                    inte samma valuta i verksamheten — en totalsumma hade dolt
                    vilken av dem som växte. */}
                <KpiCard
                  label="Engångsvärde"
                  value={`${money(deals.oneTimeTotal)} kr`}
                  sub="Summa engångsbelopp"
                  icon={<Target size={14} style={{ color: "var(--text-muted)" }} />}
                />
                <KpiCard
                  label="Månadsvärde"
                  value={`${money(deals.monthlyTotal)} kr`}
                  sub={deals.monthlyTotal > 0 ? `${money(deals.monthlyTotal * 12)} kr per år` : "Löpande avtal"}
                  icon={<Repeat size={14} style={{ color: "var(--text-muted)" }} />}
                />
                <KpiCard
                  label="Stängningsgrad"
                  value={`${conversion.closeRate}%`}
                  sub="Samtal → Såld"
                  icon={<Trophy size={14} style={{ color: "var(--text-muted)" }} />}
                />
              </div>

              <div className="p-5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Senaste avsluten</p>
                  {deals.cancelled > 0 && (
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                      <Undo2 size={10} /> {deals.cancelled} ångrade i perioden
                    </span>
                  )}
                </div>
                <RecentDeals deals={deals.recent} />
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

                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
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
                              <td className="px-4 py-3"><span className="text-[13px]" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{seller.sold}</span></td>
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
