"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Check, AlertTriangle, Sun, Moon, Monitor, Loader2 } from "lucide-react";
import { updateOwnName, changeOwnPassword } from "@/app/actions/users";
import { useTheme, type Theme } from "@/components/ThemeProvider";

type Summary = {
  days: number;
  calls: number;
  connected: number;
  sold: number;
  connectRate: string | null;
  convRate: string | null;
  avgIdlePerCall: number | null;
  callsPerDay: number;
};

/**
 * Dödtid i minuter så fort den passerat en minut.
 *
 * Siffran lagras i sekunder, och "412s i snitt" kräver huvudräkning för att
 * bli en storlek man känner igen. Under en minut är sekunder däremot det
 * naturliga måttet — "43 s" säger mer än "0,7 min".
 *
 * En decimal upp till tio minuter: skillnaden mellan 2,1 och 2,8 är fyrtio
 * sekunder per samtal och syns i dagsresultatet. Däröver är decimalen brus.
 */
function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = seconds / 60;
  const rounded = minutes < 10 ? Math.round(minutes * 10) / 10 : Math.round(minutes);
  return `${String(rounded).replace(".", ",")} min`;
}

/** En rad återkoppling. Grönt eller rött, aldrig en modal — inställningar
 *  sparas en åt gången och ett avbrott mitt i är dyrare än raden är värd. */
function Feedback({ state }: { state: { ok: boolean; msg: string } | null }) {
  if (!state) return null;
  return (
    <div
      className="flex items-center gap-2 mt-3 px-3 py-2 rounded-md text-[12px]"
      style={{
        background: state.ok ? "var(--success-bg)" : "var(--danger-bg)",
        border: `1px solid ${state.ok ? "var(--success-border)" : "var(--danger-border)"}`,
        color: state.ok ? "var(--success)" : "var(--danger)",
      }}
    >
      {state.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
      {state.msg}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6 mb-4">
      <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      {hint && (
        <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

export function SettingsView({
  name,
  email,
  role,
  memberSince,
  summary,
}: {
  name: string;
  email: string;
  role: string;
  memberSince: string;
  summary: Summary;
}) {
  const { update } = useSession();
  const { theme, setTheme } = useTheme();

  const [nameValue, setNameValue] = useState(name);
  const [nameState, setNameState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingName, startName] = useTransition();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwState, setPwState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingPw, startPw] = useTransition();

  const nameDirty = nameValue.trim() !== name && nameValue.trim().length > 0;

  function saveName() {
    setNameState(null);
    startName(async () => {
      try {
        const res = await updateOwnName(nameValue);
        // Sessionen bär en kopia av namnet. Utan den här uppdateringen står
        // sidfältet kvar med det gamla namnet till nästa inloggning.
        await update({ name: res.name });
        setNameValue(res.name);
        setNameState({ ok: true, msg: "Namnet är sparat" });
      } catch (e) {
        setNameState({ ok: false, msg: e instanceof Error ? e.message : "Kunde inte spara" });
      }
    });
  }

  function savePassword() {
    setPwState(null);
    if (next !== repeat) {
      setPwState({ ok: false, msg: "De nya lösenorden är inte lika" });
      return;
    }
    startPw(async () => {
      try {
        await changeOwnPassword(current, next);
        setCurrent("");
        setNext("");
        setRepeat("");
        setPwState({ ok: true, msg: "Lösenordet är bytt" });
      } catch (e) {
        setPwState({ ok: false, msg: e instanceof Error ? e.message : "Kunde inte byta lösenord" });
      }
    });
  }

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Ljust", icon: <Sun size={13} /> },
    { value: "dark", label: "Mörkt", icon: <Moon size={13} /> },
    { value: "system", label: "System", icon: <Monitor size={13} /> },
  ];

  return (
    <div className="max-w-[720px] mx-auto px-6 py-8">
      <h1 className="text-[24px] font-semibold mb-1" style={{ color: "var(--text)" }}>
        Inställningar
      </h1>
      <p className="text-[13px] mb-7" style={{ color: "var(--text-muted)" }}>
        {email} · {role === "ADMIN" ? "Admin" : "Säljare"} · konto sedan{" "}
        {new Date(memberSince).toLocaleDateString("sv-SE")}
      </p>

      {/* ─── Namn ─────────────────────────────────────────────────────── */}
      <Section
        title="Namn"
        hint="Så här syns du för dina kollegor i statistiken och på golvet. Skriv hela namnet, för- och efternamn."
      >
        <div className="flex items-center gap-2">
          <input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nameDirty && !savingName) saveName(); }}
            placeholder="Anna Andersson"
            maxLength={80}
            className="flex-1 px-3 py-2 text-[13px]"
          />
          <button
            onClick={saveName}
            disabled={!nameDirty || savingName}
            className="btn-primary btn-sm flex items-center gap-1.5"
          >
            {savingName && <Loader2 size={12} className="animate-spin" />}
            Spara
          </button>
        </div>
        <Feedback state={nameState} />
      </Section>

      {/* ─── Lösenord ─────────────────────────────────────────────────── */}
      <Section
        title="Byt lösenord"
        hint="Minst åtta tecken. Du måste ange ditt nuvarande lösenord — annars räcker en obevakad skärm för att låsa ute dig."
      >
        <div className="flex flex-col gap-2">
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Nuvarande lösenord"
            className="px-3 py-2 text-[13px]"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Nytt lösenord"
            className="px-3 py-2 text-[13px]"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            placeholder="Upprepa nytt lösenord"
            className="px-3 py-2 text-[13px]"
          />
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={savePassword}
            disabled={!current || next.length < 8 || !repeat || savingPw}
            className="btn-primary btn-sm flex items-center gap-1.5"
          >
            {savingPw && <Loader2 size={12} className="animate-spin" />}
            Byt lösenord
          </button>
        </div>
        <Feedback state={pwState} />
      </Section>

      {/* ─── Utseende ─────────────────────────────────────────────────── */}
      <Section
        title="Utseende"
        hint="Sparas i den här webbläsaren. System följer din dators inställning."
      >
        <div className="flex gap-2">
          {themes.map((t) => {
            const active = theme === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors"
                style={{
                  background: active ? "var(--accent)" : "var(--surface-inset)",
                  color: active ? "var(--on-accent)" : "var(--text-muted)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ─── Egen statistik ───────────────────────────────────────────── */}
      <Section title="Din statistik" hint={`Senaste ${summary.days} dagarna. Bara dina egna samtal.`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-module">
            <p className="stat-label">Samtal</p>
            <p className="stat-value mono-nums">{summary.calls}</p>
          </div>
          <div className="stat-module">
            <p className="stat-label">Framme</p>
            <p className="stat-value mono-nums">{summary.connectRate ?? "–"}{summary.connectRate && "%"}</p>
          </div>
          <div className="stat-module">
            <p className="stat-label">Sålt</p>
            <p className="stat-value mono-nums">{summary.sold}</p>
          </div>
          <div className="stat-module">
            <p className="stat-label">Per dag</p>
            <p className="stat-value mono-nums">{summary.callsPerDay}</p>
          </div>
        </div>

        {summary.avgIdlePerCall !== null && (
          <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
            Dödtid mellan samtal:{" "}
            <span className="mono-nums" style={{ color: "var(--text)" }}>
              {formatIdle(summary.avgIdlePerCall)}
            </span>{" "}
            i snitt.
          </p>
        )}
        {summary.calls === 0 && (
          <p className="text-[12px] mt-3" style={{ color: "var(--text-dim)" }}>
            Inga samtal registrerade i perioden.
          </p>
        )}
      </Section>
    </div>
  );
}
