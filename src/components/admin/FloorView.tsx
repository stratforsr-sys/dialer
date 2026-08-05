"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneCall, Coffee, Moon, AlertTriangle, Users } from "lucide-react";
import { getFloor } from "@/app/actions/presence";
import type { PresenceStatus } from "@/generated/prisma/client";

type Floor = Awaited<ReturnType<typeof getFloor>>;

const STATUS_META: Record<PresenceStatus, { label: string; color: string; icon: typeof Phone }> = {
  ON_CALL: { label: "I samtal", color: "#10B981", icon: PhoneCall },
  DIALING: { label: "Ringer", color: "#3B82F6", icon: Phone },
  WRAP_UP: { label: "Efterarbete", color: "#8B5CF6", icon: Phone },
  IDLE: { label: "Inaktiv", color: "#F59E0B", icon: Coffee },
  BREAK: { label: "Paus", color: "#6B7280", icon: Coffee },
  OFFLINE: { label: "Offline", color: "#4B5563", icon: Moon },
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Förväntat antal samtal så här långt in på arbetsdagen. */
function expectedByNow(targetPerHour: number, now: Date): number {
  const start = 8;
  const end = 17;
  const h = now.getHours() + now.getMinutes() / 60;
  if (h <= start) return 0;
  const worked = Math.min(h, end) - start;
  // En dryg timme går bort på lunch och pauser — annars ligger alla under mål
  // hela tiden, och ett larm som alltid lyser är inget larm.
  return Math.max(0, Math.round((worked - 1.25) * targetPerHour));
}

export function FloorView({ initial }: { initial: Floor }) {
  const [floor, setFloor] = useState<Floor>(initial);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      setFloor(await getFloor());
      setNow(new Date());
    } catch {
      // Ett misslyckat anrop ska inte tömma vyn — behåll förra bilden.
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Egen tick så samtalslängden räknar upp mellan hämtningarna.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const expected = expectedByNow(floor.targetPerHour, now);
  const online = floor.sellers.filter((s) => s.status !== "OFFLINE");
  const totalCalls = floor.sellers.reduce((n, s) => n + s.todayCalls, 0);
  const totalMeetings = floor.sellers.reduce((n, s) => n + s.todayMeetings, 0);

  return (
    <div className="px-8 py-7 max-w-[1200px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
            Golvet
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Uppdateras var 15:e sekund · {online.length} av {floor.sellers.length} online
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Tile label="Samtal idag" value={String(totalCalls)} />
          <Tile label="Möten idag" value={String(totalMeetings)} accent />
          <Tile label="Takt/tim" value={String(floor.targetPerHour)} muted />
        </div>
      </div>

      {floor.sellers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[16px]"
          style={{ background: "var(--surface-inset)", border: "1px dashed var(--border-strong)" }}>
          <Users size={28} style={{ color: "var(--text-dim)" }} />
          <p className="text-[14px] mt-3" style={{ color: "var(--text-muted)" }}>
            Ingen har öppnat cockpit än idag
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {floor.sellers.map((s) => {
            const meta = STATUS_META[s.status];
            const Icon = meta.icon;
            const behind = s.status !== "OFFLINE" && expected > 0 && s.todayCalls < expected * 0.7;
            const silent =
              s.status !== "OFFLINE" && s.minutesSinceHeartbeat >= floor.idleAlertMinutes;
            const callSec = s.callStartedAt
              ? Math.max(0, Math.floor((now.getTime() - new Date(s.callStartedAt).getTime()) / 1000))
              : 0;

            return (
              <motion.div
                key={s.userId}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[14px] p-4"
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${s.status === "ON_CALL" ? meta.color + "55" : "var(--border)"}`,
                  opacity: s.status === "OFFLINE" ? 0.55 : 1,
                }}
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text)" }}>
                      {s.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-[2px]">
                      <Icon size={11} style={{ color: meta.color }} />
                      <span className="text-[12px]" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      {s.status === "ON_CALL" && callSec > 0 && (
                        <span className="text-[12px] tabular-nums" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          {Math.floor(callSec / 60)}:{String(callSec % 60).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                    style={{ background: meta.color, boxShadow: `0 0 0 3px ${meta.color}22` }}
                  />
                </div>

                {s.currentCompany && (
                  <p className="text-[12px] mb-2.5 truncate" style={{ color: "var(--text-muted)" }}>
                    {s.currentCompany}
                    {s.currentListName && (
                      <span style={{ color: "var(--text-dim)" }}> · {s.currentListName}</span>
                    )}
                  </p>
                )}

                <div className="flex items-center gap-5">
                  <MiniStat label="Samtal" value={String(s.todayCalls)} />
                  <MiniStat label="Möten" value={String(s.todayMeetings)} />
                  <MiniStat label="Taltid" value={fmtDuration(s.todayTalkSec)} />
                  {expected > 0 && s.status !== "OFFLINE" && (
                    <MiniStat label="Mål nu" value={String(expected)} muted />
                  )}
                </div>

                {/* Insatslarm — aldrig utfallslarm. */}
                {(behind || silent) && (
                  <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                    <AlertTriangle size={11} style={{ color: "var(--warning)" }} />
                    <span className="text-[11px]" style={{ color: "var(--warning)" }}>
                      {silent
                        ? `Inget samtal på ${s.minutesSinceHeartbeat} min`
                        : `${s.todayCalls} samtal — takten ligger under ${expected}`}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="text-[11px] mt-6 leading-relaxed max-w-[640px]" style={{ color: "var(--text-dim)" }}>
        Vyn larmar på insats — samtalstakt och tystnad — och aldrig på försäljning. Vid ett bokat
        möte per 45–100 samtal är “ingen affär på tre timmar” det vanligaste utfallet även för en
        stark säljare, alltså brus. Larm på utfall saknar dessutom stöd i forskningen, medan
        insatsbaserad återkoppling har visats höja både samtalsvolym och försäljning hos de svagaste
        utan att skada de starkaste. Försäljningssiffror hör hemma i dagsrapporten.
      </p>
    </div>
  );
}

function Tile({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <p className="text-[22px] font-semibold tabular-nums"
        style={{ color: accent ? "var(--accent)" : muted ? "var(--text-dim)" : "var(--text)", fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <p className="text-[14px] font-semibold tabular-nums"
        style={{ color: muted ? "var(--text-dim)" : "var(--text)", fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
    </div>
  );
}
