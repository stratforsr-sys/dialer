"use client";

import { Upload, LayoutDashboard, List, Zap, Users } from "lucide-react";
import type { ViewMode } from "@/types";

interface SidebarProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  hasData: boolean;
  listName: string;
  contactCount: number;
}

const NAV_ITEMS: { key: ViewMode; label: string; icon: typeof Upload; needsData?: boolean }[] = [
  { key: "import", label: "Importera", icon: Upload },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, needsData: true },
  { key: "list", label: "Kontakter", icon: List, needsData: true },
  { key: "cockpit", label: "Dialer", icon: Zap, needsData: true },
];

export function Sidebar({ view, setView, hasData, listName, contactCount }: SidebarProps) {
  return (
    <aside className="w-[220px] flex-shrink-0 h-screen flex flex-col border-r border-telink-border bg-telink-surface/60 backdrop-blur-sm">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2bb574] flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-[15px] tracking-tight text-telink-text">telink</span>
            <span className="text-[10px] block -mt-0.5 text-telink-muted font-medium tracking-widest uppercase">Sales Dialer</span>
          </div>
        </div>
      </div>

      {/* List info */}
      {hasData && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-telink-surface border border-telink-border">
          <div className="text-xs text-telink-muted font-medium mb-0.5">Aktiv lista</div>
          <div className="text-sm font-semibold text-telink-text truncate">{listName}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <Users size={11} className="text-telink-muted" />
            <span className="text-xs text-telink-muted">{contactCount} kontakter</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-telink-dim px-2 mb-2">Navigation</div>
        {NAV_ITEMS.map((item) => {
          const disabled = item.needsData && !hasData;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => !disabled && setView(item.key)}
              disabled={disabled}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${active
                  ? "bg-[rgba(43,181,116,0.10)] text-[#2bb574]"
                  : disabled
                    ? "text-telink-dim cursor-not-allowed opacity-40"
                    : "text-telink-muted hover:bg-telink-surface-hover hover:text-telink-text cursor-pointer"
                }
              `}
            >
              <item.icon size={16} />
              {item.label}
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#2bb574]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-telink-border">
        <div className="text-[10px] text-telink-dim text-center">
          Telink AB © {new Date().getFullYear()}
        </div>
      </div>
    </aside>
  );
}
