"use client";

import { useState } from "react";
import {
  Settings, User, Bell, Palette, Phone, Target, Clock, Volume2,
  Moon, Sun, Monitor, Save, RotateCcw, Trash2, Download, Upload,
  Shield, Database, Zap, ChevronRight, Check, Info
} from "lucide-react";

interface SettingsViewProps {
  onExportData?: () => void;
  onClearData?: () => void;
}

export function SettingsView({ onExportData, onClearData }: SettingsViewProps) {
  // Settings state
  const [dailyGoal, setDailyGoal] = useState(50);
  const [callCooldown, setCallCooldown] = useState(5);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [compactMode, setCompactMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [autoSaveNotes, setAutoSaveNotes] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(true);

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // In a real app, this would persist settings
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Vill du återställa alla inställningar till standard?")) {
      setDailyGoal(50);
      setCallCooldown(5);
      setAutoAdvance(true);
      setSoundEnabled(true);
      setNotifications(true);
      setTheme("dark");
      setCompactMode(false);
      setShowShortcuts(true);
      setAutoSaveNotes(true);
      setConfirmDelete(true);
    }
  };

  const handleClearData = () => {
    if (confirm("Är du säker? Detta kommer radera ALLA dina ringlistor och kontakter permanent.")) {
      onClearData?.();
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-cockpit-bg">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cockpit-surface border border-cockpit-border flex items-center justify-center">
              <Settings size={18} className="text-cockpit-text" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-cockpit-text tracking-tight">Inställningar</h1>
              <p className="text-sm text-cockpit-text-muted">Anpassa din dialer-upplevelse</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              <RotateCcw size={14} />
              Återställ
            </button>
            <button
              onClick={handleSave}
              className="btn-primary"
            >
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? "Sparat!" : "Spara"}
            </button>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {/* Calling Settings */}
          <SettingsSection
            icon={Phone}
            title="Samtalsinställningar"
            description="Justera hur dialern fungerar"
            delay="50ms"
          >
            <SettingRow
              label="Dagligt mål"
              description="Antal samtal du siktar på per dag"
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={10}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(parseInt(e.target.value))}
                  className="w-32 accent-cockpit-success"
                />
                <span className="w-12 text-sm font-mono text-cockpit-text tabular-nums">{dailyGoal}</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Samtalspaus"
              description="Sekunder mellan automatisk avancering"
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={5}
                  value={callCooldown}
                  onChange={(e) => setCallCooldown(parseInt(e.target.value))}
                  className="w-32 accent-cockpit-success"
                />
                <span className="w-12 text-sm font-mono text-cockpit-text tabular-nums">{callCooldown}s</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Auto-avancera"
              description="Gå automatiskt till nästa kontakt efter statusval"
            >
              <Toggle enabled={autoAdvance} onChange={setAutoAdvance} />
            </SettingRow>

            <SettingRow
              label="Auto-spara anteckningar"
              description="Spara anteckningar automatiskt medan du skriver"
            >
              <Toggle enabled={autoSaveNotes} onChange={setAutoSaveNotes} />
            </SettingRow>
          </SettingsSection>

          {/* Appearance */}
          <SettingsSection
            icon={Palette}
            title="Utseende"
            description="Anpassa utseende och tema"
            delay="100ms"
          >
            <SettingRow
              label="Tema"
              description="Välj ljust, mörkt eller systemtema"
            >
              <div className="flex items-center gap-1 p-1 rounded-lg bg-cockpit-bg">
                <ThemeButton
                  icon={Sun}
                  label="Ljust"
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                />
                <ThemeButton
                  icon={Moon}
                  label="Mörkt"
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                />
                <ThemeButton
                  icon={Monitor}
                  label="System"
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Kompakt läge"
              description="Minska marginaler och storlekar"
            >
              <Toggle enabled={compactMode} onChange={setCompactMode} />
            </SettingRow>

            <SettingRow
              label="Visa snabbkommandon"
              description="Visa tangentbordsgenvägar i cockpit"
            >
              <Toggle enabled={showShortcuts} onChange={setShowShortcuts} />
            </SettingRow>
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection
            icon={Bell}
            title="Notifikationer"
            description="Ljud och aviseringar"
            delay="150ms"
          >
            <SettingRow
              label="Ljud"
              description="Spela upp ljud vid statusval"
            >
              <Toggle enabled={soundEnabled} onChange={setSoundEnabled} />
            </SettingRow>

            <SettingRow
              label="Notifikationer"
              description="Visa desktop-notifikationer"
            >
              <Toggle enabled={notifications} onChange={setNotifications} />
            </SettingRow>
          </SettingsSection>

          {/* Data Management */}
          <SettingsSection
            icon={Database}
            title="Datahantering"
            description="Exportera, importera och rensa data"
            delay="200ms"
          >
            <SettingRow
              label="Bekräfta borttagning"
              description="Fråga innan kontakter eller listor tas bort"
            >
              <Toggle enabled={confirmDelete} onChange={setConfirmDelete} />
            </SettingRow>

            <SettingRow
              label="Exportera data"
              description="Ladda ner alla dina listor som JSON"
            >
              <button
                onClick={onExportData}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <Download size={12} />
                Exportera
              </button>
            </SettingRow>

            <SettingRow
              label="Rensa all data"
              description="Ta bort alla listor och kontakter permanent"
              danger
            >
              <button
                onClick={handleClearData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-cockpit-danger bg-cockpit-danger-bg hover:bg-cockpit-danger/20 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Rensa
              </button>
            </SettingRow>
          </SettingsSection>

          {/* Keyboard Shortcuts Reference */}
          <SettingsSection
            icon={Zap}
            title="Snabbkommandon"
            description="Tangentbordsgenvägar i dialern"
            delay="250ms"
          >
            <div className="grid grid-cols-2 gap-3">
              <ShortcutItem keys={["1", "-", "7"]} label="Välj status (1-7)" />
              <ShortcutItem keys={["D"]} label="Ring direktnummer" />
              <ShortcutItem keys={["V"]} label="Ring växel" />
              <ShortcutItem keys={["Space"]} label="Ring först tillgängliga" />
              <ShortcutItem keys={["N"]} label="Nästa kontakt" />
              <ShortcutItem keys={["P"]} label="Föregående kontakt" />
              <ShortcutItem keys={["⌘", "K"]} label="Kommandopalett" />
              <ShortcutItem keys={["?"]} label="Visa hjälp" />
              <ShortcutItem keys={["Esc"]} label="Avsluta dialer" />
              <ShortcutItem keys={["E"]} label="Kopiera e-post" />
            </div>
          </SettingsSection>

          {/* About */}
          <div className="card p-5 animate-fade-up" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cockpit-text flex items-center justify-center">
                <Zap size={18} className="text-cockpit-bg" />
              </div>
              <div>
                <span className="font-semibold text-cockpit-text">Telink Dialer</span>
                <p className="text-xs text-cockpit-text-muted">Version 1.0.0</p>
              </div>
            </div>
            <p className="text-xs text-cockpit-text-dim mt-3 leading-relaxed">
              En modern dialer för effektiv prospektering och kundkontakt.
              Byggd med fokus på produktivitet och användarvänlighet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SettingsSection({ icon: Icon, title, description, delay = "0ms", children }: {
  icon: typeof Settings;
  title: string;
  description: string;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: delay }}>
      <div className="p-5 border-b border-cockpit-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
            <Icon size={16} className="text-cockpit-text-muted" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-cockpit-text">{title}</h3>
            <p className="text-xs text-cockpit-text-muted">{description}</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-cockpit-border">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, danger, children }: {
  label: string;
  description: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-cockpit-surface-hover transition-colors">
      <div>
        <div className={`text-sm font-medium ${danger ? "text-cockpit-danger" : "text-cockpit-text"}`}>
          {label}
        </div>
        <div className="text-xs text-cockpit-text-muted mt-0.5">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`
        relative w-11 h-6 rounded-full transition-colors cursor-pointer
        ${enabled ? "bg-cockpit-success" : "bg-cockpit-bg-muted"}
      `}
    >
      <div
        className={`
          absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform
          ${enabled ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

function ThemeButton({ icon: Icon, label, active, onClick }: {
  icon: typeof Sun;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer
        ${active
          ? "bg-cockpit-surface text-cockpit-text shadow-sm"
          : "text-cockpit-text-muted hover:text-cockpit-text-secondary"
        }
      `}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function ShortcutItem({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-cockpit-bg">
      <span className="text-xs text-cockpit-text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="px-2 py-1 text-2xs font-mono bg-cockpit-surface border border-cockpit-border rounded text-cockpit-text-muted"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
