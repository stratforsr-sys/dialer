"use client";

import {
  Settings, Bell, Palette, Phone, Target,
  Moon, Sun, Monitor, Save, RotateCcw, Trash2, Download,
  Zap, Check
} from "lucide-react";
import { useTheme, type Theme } from "@/hooks/useTheme";

interface SettingsViewProps {
  onExportData?: () => void;
  onClearData?: () => void;
}

export function SettingsView({ onExportData, onClearData }: SettingsViewProps) {
  const { theme, setTheme } = useTheme();

  const handleClearData = () => {
    if (confirm("Är du säker? Detta kommer radera ALLA dina ringlistor och kontakter permanent.")) {
      onClearData?.();
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-fade-up">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <Settings size={18} style={{ color: "var(--text-muted)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tighter" style={{ color: "var(--text)" }}>Inställningar</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Anpassa din dialer-upplevelse</p>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {/* Appearance - Theme Selection */}
          <SettingsSection
            icon={Palette}
            title="Utseende"
            description="Anpassa tema och utseende"
            delay="50ms"
          >
            <SettingRow
              label="Tema"
              description="Välj ljust, mörkt eller följ systemet"
            >
              <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-muted)" }}>
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
          </SettingsSection>

          {/* Calling Settings */}
          <SettingsSection
            icon={Phone}
            title="Samtalsinställningar"
            description="Justera hur dialern fungerar"
            delay="100ms"
          >
            <SettingRow
              label="Dagligt mål"
              description="Antal samtal du siktar på per dag"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono tabular-nums" style={{ color: "var(--text)" }}>50</span>
              </div>
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
              <Toggle defaultEnabled={true} />
            </SettingRow>
          </SettingsSection>

          {/* Data Management */}
          <SettingsSection
            icon={Target}
            title="Datahantering"
            description="Exportera och hantera data"
            delay="200ms"
          >
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                style={{
                  color: "var(--danger)",
                  background: "var(--danger-bg)",
                }}
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
            <div className="grid grid-cols-2 gap-3 p-4">
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
          <div
            className="card p-5 animate-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                <Zap size={18} />
              </div>
              <div>
                <span className="font-semibold" style={{ color: "var(--text)" }}>Telink Dialer</span>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Version 1.0.0</p>
              </div>
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
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
      <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-muted)" }}
          >
            <Icon size={16} style={{ color: "var(--text-muted)" }} />
          </div>
          <div>
            <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }}>
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
    <div
      className="flex items-center justify-between px-5 py-4 transition-colors"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div>
        <div className="text-sm font-medium" style={{ color: danger ? "var(--danger)" : "var(--text)" }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{description}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ defaultEnabled = false }: { defaultEnabled?: boolean }) {
  return (
    <button
      className={`toggle ${defaultEnabled ? "active" : ""}`}
    >
      <div className="toggle-thumb" />
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
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--text)" : "var(--text-muted)",
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function ShortcutItem({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg"
      style={{ background: "var(--bg-muted)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <kbd key={i}>{key}</kbd>
        ))}
      </div>
    </div>
  );
}
