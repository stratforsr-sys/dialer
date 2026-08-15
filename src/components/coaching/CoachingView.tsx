"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Clock, Phone, Timer, CheckCircle2 } from "lucide-react";
import type { CoachingBoard, CoachingSeller } from "@/app/actions/coaching";

const RANGES = [
  { days: 1, label: "I dag" },
  { days: 7, label: "7 dagar" },
  { days: 30, label: "30 dagar" },
];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
}

/**
 * Ett mätvärde med golvets median bredvid.
 *
 * Siffran ensam säger ingenting — 38 % korta samtal är bra eller katastrof
 * beroende på vad de andra gör. Referensen står därför alltid intill, och
 * `worse` avgör om värdet ska bära färg. Bara det som är sämre färgas: en
 * skärm där varje tal är grönt eller rött läses inte alls.
 */
function Metric({
  label,
  value,
  team,
  worse,
}: {
  label: string;
  value: string;
  team: string;
  worse: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] mb-[3px]" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <p
        className="text-[19px] font-semibold leading-none mono-nums"
        style={{ color: worse ? "var(--danger)" : "var(--text)" }}
      >
        {value}
      </p>
      <p className="text-[10px] mt-[3px]" style={{ color: "var(--text-dim)" }}>
        golvet {team}
      </p>
    </div>
  );
}

/**
 * Taltid per timme, 06–19.
 *
 * Staplarna är avsiktligt små och omärkta bortsett från ändpunkterna. Formen
 * är hela informationen: var på dagen tiden ligger, och var den tar slut.
 */
function HourStrip({ byHour }: { byHour: number[] }) {
  const max = Math.max(...byHour, 1);
  return (
    <div>
      <p className="text-[11px] mb-[6px]" style={{ color: "var(--text-dim)" }}>
        Taltid per timme
      </p>
      <div className="flex items-end gap-[2px] h-[34px]">
        {byHour.map((m, i) => (
          <div key={i} className="flex-1 group relative flex items-end h-full">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max((m / max) * 100, 3)}%`,
                background: m === 0 ? "var(--border)" : "var(--accent)",
                opacity: m === 0 ? 0.5 : 0.75,
              }}
            />
            <div
              className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-[6px] py-[2px] text-[10px] rounded-sm whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              kl {i + 6} — {m} min
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-[3px]">
        <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>06</span>
        <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>12</span>
        <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>19</span>
      </div>
    </div>
  );
}

function SellerCard({ s, team }: { s: CoachingSeller; team: CoachingBoard["team"] }) {
  const thin = s.calls < 15;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        // Kanten bär avvikelsen. Ingen färgad yta, ingen skugga — kortet ligger
        // i samma plan som de andra, det har bara något att säga.
        borderLeft: s.flags.length
          ? "3px solid var(--danger)"
          : "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          {s.name}
        </h3>
        <span className="text-[11px] mono-nums shrink-0" style={{ color: "var(--text-dim)" }}>
          {s.calls} samtal · {s.talkMinutes} min tal
        </span>
      </div>

      {thin ? (
        <p className="text-[12px] py-2" style={{ color: "var(--text-dim)" }}>
          För få samtal i perioden för att säga något. Medianer på under femton
          samtal är brus.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Metric
              label="Korta samtal"
              value={`${Math.round(s.shortShare * 100)} %`}
              team={`${Math.round(team.shortShare * 100)} %`}
              worse={s.shortShare > team.shortShare + 0.1}
            />
            <Metric
              label="Dödtid mellan"
              value={mmss(s.medianGapSec)}
              team={mmss(team.medianGapSec)}
              worse={team.medianGapSec > 0 && s.medianGapSec > team.medianGapSec * 1.5}
            />
            <Metric
              label="Samtalslängd"
              value={mmss(s.medianTalkSec)}
              team={mmss(team.medianTalkSec)}
              worse={team.medianTalkSec > 0 && s.medianTalkSec < team.medianTalkSec * 0.6}
            />
          </div>

          <HourStrip byHour={s.byHour} />

          {s.flags.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {s.flags.map((f, i) => (
                <li key={i} className="flex gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <AlertTriangle
                    size={13}
                    className="shrink-0 mt-[2px]"
                    style={{ color: "var(--danger)" }}
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function CoachingView({ board, isAdmin }: { board: CoachingBoard; isAdmin: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = Number(params.get("days")) || 7;

  const flagged = board.sellers.filter((s) => s.flags.length > 0);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h1 className="text-[24px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
          Coaching
        </h1>

        <div className="segmented">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => router.push(`/coaching?days=${r.days}`)}
              className={`segmented-item${current === r.days ? " active" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] mb-6" style={{ color: "var(--text-dim)" }}>
        Räknat på växelns samtal, inte på dispositionerna. Ringtiden — {board.ringOverheadSec} sekunder
        i median — är bortdragen, så längderna är uppkopplad tid.
      </p>

      {board.totalCalls === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <Phone size={20} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Inga samtal från växeln i perioden.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Summary
              icon={<AlertTriangle size={14} style={{ color: flagged.length ? "var(--danger)" : "var(--text-dim)" }} />}
              value={String(flagged.length)}
              label={flagged.length === 1 ? "säljare med avvikelse" : "säljare med avvikelser"}
            />
            <Summary
              icon={<Phone size={14} style={{ color: "var(--text-dim)" }} />}
              value={String(board.totalCalls)}
              label="samtal i perioden"
            />
            <Summary
              icon={<Timer size={14} style={{ color: "var(--text-dim)" }} />}
              value={mmss(board.team.medianGapSec)}
              label="dödtid, golvets median"
            />
            <Summary
              icon={<Clock size={14} style={{ color: "var(--text-dim)" }} />}
              value={mmss(board.team.medianTalkSec)}
              label="samtalslängd, median"
            />
          </div>

          {/*
            Samtal växeln såg men ingen registrerade. Står här och inte som en
            flagga på en säljare: den som inte dispositionerar syns inte i
            något utfall, och siffran är ett mått på hur mycket av golvets
            arbete som saknas i statistiken.
          */}
          {board.unregistered > 0 && (
            <div
              className="rounded-lg px-4 py-3 mb-6 flex items-start gap-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <AlertTriangle size={14} className="shrink-0 mt-[2px]" style={{ color: "var(--warning)" }} />
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>{board.unregistered} samtal</strong> saknar
                disposition — växeln registrerade dem, men ingen sa vad de ledde till. De räknas i
                taltiden ovan och saknas i all utfallsstatistik.
              </p>
            </div>
          )}

          {flagged.length === 0 && (
            <div
              className="rounded-lg px-4 py-3 mb-6 flex items-center gap-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <CheckCircle2 size={14} style={{ color: "var(--accent)" }} />
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Ingen ligger tillräckligt långt från golvet för att bära ett coachingsamtal.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {board.sellers.map((s) => (
              <SellerCard key={s.id} s={s} team={board.team} />
            ))}
          </div>

          {!isAdmin && (
            <p className="text-[11px] mt-6" style={{ color: "var(--text-dim)" }}>
              Du ser dina egna siffror. Jämförelsetalen är golvets medianer, utan namn.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="mb-2">{icon}</div>
      <p className="text-[24px] font-bold leading-none mono-nums" style={{ color: "var(--text)" }}>
        {value}
      </p>
      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
    </div>
  );
}
