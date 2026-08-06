"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus, Trash2, AlertTriangle, TrendingDown } from "lucide-react";
import { updateDialerConfig, saveSlots } from "@/app/actions/dialer-settings";

type Config = {
  maxAttempts: number;
  cooldownDays: number;
  leaseMinutes: number;
  leaseBlockSize: number;
  retryHoursNoAnswer: number;
  retryHoursBusy: number;
  retryHoursVoicemail: number;
  retryHoursGatekeeper: number;
  retryDaysNoSalespeople: number;
  targetCallsPerHour: number;
  idleAlertMinutes: number;
  blockedDatesJson: string;
};

type Slot = { id?: string; name: string; startMinute: number; endMinute: number; order: number; active: boolean };

type Forecast = {
  totalLeads: number;
  retiredLeads: number;
  callableNow: number;
  remainingAttempts: number;
  callsPerDay: number;
  daysOfSupply: number | null;
  maxAttempts: number;
};

function toTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function DialerSettingsView({
  config,
  slots: initialSlots,
  forecast,
}: {
  config: Config;
  slots: Slot[];
  forecast: Forecast;
}) {
  const [cfg, setCfg] = useState(config);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [blockedDates, setBlockedDates] = useState<string[]>(() => {
    try {
      const p = JSON.parse(config.blockedDatesJson);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  });
  const [newDate, setNewDate] = useState("");
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startSaving(async () => {
      await Promise.all([
        updateDialerConfig({ ...cfg, blockedDates }),
        saveSlots(slots.map((s, i) => ({ ...s, order: i + 1 }))),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    });
  }

  // Hur länge räcker databasen med det valda taket?
  const projectedCapacity =
    (forecast.totalLeads - forecast.retiredLeads) * cfg.maxAttempts;
  const projectedDays =
    forecast.callsPerDay > 0 ? Math.round(projectedCapacity / forecast.callsPerDay) : null;

  return (
    <div className="px-8 py-7 max-w-[980px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
            Uppföljningsmotorn
          </h1>
          <p className="text-[13px] max-w-[640px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Hur många gånger ett lead ringes, när det vilar, och i vilka tidsfönster.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-[10px] shrink-0"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
          {saved ? "Sparat" : "Spara"}
        </button>
      </div>

      {/* Leadförsörjning — den siffra som avgör allt annat */}
      <div className="rounded-[16px] p-5 mb-6"
        style={{
          background: projectedDays !== null && projectedDays < 20 ? "var(--danger-bg)" : "var(--surface-inset)",
          border: `1px solid ${projectedDays !== null && projectedDays < 20 ? "var(--danger-border)" : "var(--border)"}`,
        }}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={14} style={{ color: projectedDays !== null && projectedDays < 20 ? "var(--danger)" : "var(--text-muted)" }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: projectedDays !== null && projectedDays < 20 ? "var(--danger)" : "var(--text-dim)" }}>
            Leadförsörjning
          </p>
        </div>

        <div className="grid grid-cols-4 gap-5">
          <Stat label="Leads totalt" value={forecast.totalLeads.toLocaleString("sv-SE")} />
          <Stat label="Ringbara nu" value={forecast.callableNow.toLocaleString("sv-SE")} />
          <Stat label="Samtal per dag" value={forecast.callsPerDay > 0 ? String(forecast.callsPerDay) : "—"} />
          <Stat
            label="Räcker i"
            value={projectedDays !== null ? `${projectedDays} dagar` : "—"}
            emphasis={projectedDays !== null && projectedDays < 20}
          />
        </div>

        {projectedDays !== null && projectedDays < 20 && (
          <div className="flex items-start gap-2 mt-4 pt-3 border-t" style={{ borderColor: "var(--danger-border)" }}>
            <AlertTriangle size={13} className="mt-[2px] shrink-0" style={{ color: "var(--danger)" }} />
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text)" }}>
              Med tak {cfg.maxAttempts} och nuvarande takt tar de ringbara leadsen slut om cirka {projectedDays} dagar,
              varefter allt ligger i {cfg.cooldownDays} dagars vila. Höjt tak köper tid, men den verkliga
              flaskhalsen är leadförsörjning — inte uppföljningslogik.
            </p>
          </div>
        )}
      </div>

      {/* Tak och vila */}
      <Section title="Tak och vila">
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Max antal försök"
            value={cfg.maxAttempts}
            onChange={(v) => setCfg({ ...cfg, maxAttempts: v })}
            hint="Data visar att 93% av nådda leads nås inom 6 försök, och att leads som kräver fler än 7 samtal konverterar 45% sämre. Vid liten databas väger det lättare än att golvet står still."
          />
          <NumberField
            label="Vila efteråt (dagar)"
            value={cfg.cooldownDays}
            onChange={(v) => setCfg({ ...cfg, cooldownDays: v })}
            hint="Efter vilan börjar räknaren om. Leadet raderas aldrig."
          />
        </div>
      </Section>

      {/* Väntetid per resultat */}
      <Section title="Väntetid till nästa försök">
        <div className="grid grid-cols-4 gap-3">
          <NumberField label="Svarar ej (h)" value={cfg.retryHoursNoAnswer} onChange={(v) => setCfg({ ...cfg, retryHoursNoAnswer: v })} />
          <NumberField label="Upptaget (h)" value={cfg.retryHoursBusy} onChange={(v) => setCfg({ ...cfg, retryHoursBusy: v })} />
          <NumberField label="Röstbrevlåda (h)" value={cfg.retryHoursVoicemail} onChange={(v) => setCfg({ ...cfg, retryHoursVoicemail: v })} />
          <NumberField label="Växelstopp (h)" value={cfg.retryHoursGatekeeper} onChange={(v) => setCfg({ ...cfg, retryHoursGatekeeper: v })} />
          <NumberField label="Ej säljsamtal (dagar)" value={cfg.retryDaysNoSalespeople} onChange={(v) => setCfg({ ...cfg, retryDaysNoSalespeople: v })} />
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-dim)" }}>
          Udda tal är avsiktliga: 20 timmar i stället för 24 gör att nästa försök hamnar i ett annat
          tidsfönster i stället för på exakt samma klockslag nästa dag.
        </p>
      </Section>

      {/* Ringpass */}
      <Section title="Ringpass">
        <p className="text-[12px] mb-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Motorn föredrar ett oprövat pass för varje nytt försök, men blockerar aldrig ett samtal
          för att rotationen är slut. Passen 11–12 och 13–14 är de svagaste i publicerad data och
          krockar med svensk lunch — därför är standardvärdena förskjutna.
        </p>

        <div className="flex flex-col gap-2">
          {slots.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex items-center gap-2">
              <input
                value={s.name}
                onChange={(e) => setSlots((p) => p.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                className="flex-1 px-3 py-2 text-[13px] rounded-[9px] outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
              <input
                type="time"
                value={toTime(s.startMinute)}
                onChange={(e) => setSlots((p) => p.map((x, idx) => (idx === i ? { ...x, startMinute: toMinutes(e.target.value) } : x)))}
                className="px-2 py-2 text-[13px] rounded-[9px] outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
              <span style={{ color: "var(--text-dim)" }}>–</span>
              <input
                type="time"
                value={toTime(s.endMinute)}
                onChange={(e) => setSlots((p) => p.map((x, idx) => (idx === i ? { ...x, endMinute: toMinutes(e.target.value) } : x)))}
                className="px-2 py-2 text-[13px] rounded-[9px] outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
              <button
                onClick={() => setSlots((p) => p.map((x, idx) => (idx === i ? { ...x, active: !x.active } : x)))}
                className="px-2.5 py-2 text-[11px] rounded-[9px]"
                style={{
                  background: s.active ? "var(--success-bg)" : "var(--surface-inset)",
                  color: s.active ? "var(--success)" : "var(--text-dim)",
                  border: `1px solid ${s.active ? "var(--success-border)" : "var(--border)"}`,
                }}
              >
                {s.active ? "Aktivt" : "Av"}
              </button>
              <button
                onClick={() => setSlots((p) => p.filter((_, idx) => idx !== i))}
                className="w-8 h-8 flex items-center justify-center rounded-[8px]"
                style={{ color: "var(--text-dim)" }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setSlots((p) => [...p, { name: "Nytt pass", startMinute: 600, endMinute: 660, order: p.length + 1, active: true }])}
          className="flex items-center gap-1.5 mt-2 px-3 py-2 text-[12px] rounded-[9px] w-full justify-center"
          style={{ background: "var(--surface-inset)", border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}
        >
          <Plus size={12} /> Lägg till pass
        </button>
      </Section>

      {/* Spärrade datum */}
      <Section title="Datum som aldrig ringes">
        <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
          Helger hoppas alltid över automatiskt. Lägg till röda dagar, klämdagar, midsommarafton
          och mellandagarna — annars landar en 30-dagars vila mitt i semestern.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {blockedDates.map((d) => (
            <button
              key={d}
              onClick={() => setBlockedDates((p) => p.filter((x) => x !== d))}
              className="text-[11px] px-2 py-1 rounded-[7px]"
              style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border-strong)", fontFamily: "var(--font-mono)" }}
            >
              {d} ×
            </button>
          ))}
          {blockedDates.length === 0 && (
            <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>Inga spärrade datum</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="px-3 py-2 text-[13px] rounded-[9px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
          />
          <button
            onClick={() => {
              if (newDate && !blockedDates.includes(newDate)) {
                setBlockedDates((p) => [...p, newDate].sort());
                setNewDate("");
              }
            }}
            className="px-3 py-2 text-[12px] font-semibold rounded-[9px]"
            style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
          >
            Lägg till
          </button>
        </div>
      </Section>

      {/* Chefsvyns larm */}
      <Section title="Larm i chefsvyn">
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Förväntad takt (samtal/timme)"
            value={cfg.targetCallsPerHour}
            onChange={(v) => setCfg({ ...cfg, targetCallsPerHour: v })}
            hint="Larm på insats, inte på utfall. Vid ett bokat möte per 45–100 samtal är “ingen försäljning på tre timmar” det vanligaste utfallet även för en bra säljare — alltså brus."
          />
          <NumberField
            label="Larma efter tystnad (minuter)"
            value={cfg.idleAlertMinutes}
            onChange={(v) => setCfg({ ...cfg, idleAlertMinutes: v })}
            hint="Visas för säljaren själv först. Eskalerar bara om det inte rättar sig."
          />
        </div>
      </Section>

      <Section title="Arbetslås">
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Låstid (minuter)" value={cfg.leaseMinutes} onChange={(v) => setCfg({ ...cfg, leaseMinutes: v })}
            hint="Hur länge ett lead är reserverat åt en säljare i cockpit. Går låset ut blir leadet ringbart igen automatiskt — övergivna flikar självläker." />
          <NumberField label="Leads per hämtning" value={cfg.leaseBlockSize} onChange={(v) => setCfg({ ...cfg, leaseBlockSize: v })} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "var(--text-dim)" }}>
        {title}
      </h2>
      <div className="rounded-[14px] p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <p className="text-[20px] font-semibold tabular-nums"
        style={{ color: emphasis ? "var(--danger)" : "var(--text)", fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
    </div>
  );
}

function NumberField({
  label, value, onChange, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 px-3 py-2 text-[13px] rounded-[9px] outline-none"
        style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
      />
      {hint && (
        <span className="block text-[11px] mt-1 leading-snug" style={{ color: "var(--text-dim)" }}>{hint}</span>
      )}
    </label>
  );
}
