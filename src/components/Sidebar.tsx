"use client";

import { LayoutDashboard, List, Zap, Command, BarChart3, Settings, FlaskConical, FolderOpen } from "lucide-react";
import type { ViewMode } from "@/types";

interface SidebarProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  hasData: boolean;
  activeListName?: string;
}

const NAV_ITEMS: { key: ViewMode; label: string; icon: typeof LayoutDashboard; needsData?: boolean }[] = [
  { key: "lists",     label: "Ringlistor",  icon: FolderOpen },
  { key: "dashboard", label: "Dashboard",   icon: LayoutDashboard, needsData: true },
  { key: "list",      label: "Kontakter",   icon: List,            needsData: true },
  { key: "cockpit",   label: "Dialer",      icon: Zap,             needsData: true },
  { key: "stats",     label: "Statistik",   icon: BarChart3,       needsData: true },
  { key: "research",  label: "Research",    icon: FlaskConical },
  { key: "settings",  label: "Inställningar", icon: Settings },
];

export function Sidebar({ view, setView, hasData, activeListName }: SidebarProps) {
  return (
    <aside
      className="w-[220px] flex-shrink-0 h-screen flex flex-col"
      style={{ background: "var(--bg)", borderRight: "1px solid var(--border)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--text)" }}
          >
            <Zap size={16} style={{ color: "var(--bg)" }} strokeWidth={2} />
          </div>
          <div>
            <span
              className="font-semibold text-sm tracking-tight"
              style={{ color: "var(--text)" }}
            >
              telink
            </span>
            <span
              className="text-2xs block font-medium tracking-wider uppercase"
              style={{ color: "var(--text-dim)" }}
            >
              Dialer
            </span>
          </div>
        </div>
      </div>

      {/* Active list indicator */}
      {hasData && activeListName && (
        <>
          <div className="mx-4 h-px" style={{ background: "var(--border)" }} />
          <div className="px-5 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>
              Aktiv lista
            </p>
            <button
              onClick={() => setView("lists")}
              className="flex items-center gap-2 w-full text-left group"
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "var(--success)" }}
              />
              <span
                className="text-xs font-medium truncate transition-colors group-hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {activeListName}
              </span>
            </button>
          </div>
        </>
      )}

      <div className="mx-4 h-px" style={{ background: "var(--border)" }} />

      {/* Navigation */}
      <nav className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="px-2 mb-3">
          <span
            className="text-2xs font-semibold tracking-wider uppercase"
            style={{ color: "var(--text-dim)" }}
          >
            Navigering
          </span>
        </div>

        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const disabled = !!(item.needsData && !hasData);
            const active = view === item.key;

            return (
              <button
                key={item.key}
                onClick={() => !disabled && setView(item.key)}
                disabled={disabled}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150"
                style={{
                  background: active ? "var(--surface)" : undefined,
                  border: active ? "1px solid var(--border)" : "1px solid transparent",
                  boxShadow: active ? "var(--shadow-sm)" : undefined,
                  color: active ? "var(--text)" : disabled ? "var(--text-dim)" : "var(--text-secondary)",
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <div
                  className="w-6 h-6 rounded flex items-center justify-center transition-colors duration-150"
                  style={{
                    background: active ? "var(--bg)" : "var(--bg-subtle)",
                    color: active ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  <item.icon size={12} />
                </div>
                {item.label}
                {active && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--success)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-2xs" style={{ color: "var(--text-dim)" }}>
          <kbd className="text-2xs">
            <Command size={10} />
          </kbd>
          <kbd className="text-2xs">K</kbd>
          <span>Kommandopalett</span>
        </div>
      </div>
    </aside>
  );
}
