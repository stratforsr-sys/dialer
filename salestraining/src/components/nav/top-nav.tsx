"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandPalette } from "./command-palette";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: GridIcon },
  { label: "Moduler", href: "/modules", icon: BookIcon },
  { label: "Öva", href: "/practice", icon: TargetIcon },
  { label: "Rollspel", href: "/roleplay", icon: UsersIcon },
  { label: "Möten", href: "/meetings", icon: MicIcon },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-[var(--space-6)] h-14"
        style={{
          background: "rgba(10, 10, 11, 0.8)",
          backdropFilter: "blur(16px) saturate(180%)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-[var(--space-3)]">
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{
              background: "var(--accent-muted)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-accent)",
            }}
          >
            <span className="font-heading text-sm font-bold" style={{ color: "var(--accent)" }}>
              SR
            </span>
          </div>
          <span
            className="font-heading text-base font-semibold hidden sm:block"
            style={{ color: "var(--text-primary)" }}
          >
            Sales Reflex
          </span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-[var(--space-1)]">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-sm transition-all"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <item.icon size={16} active={isActive} />
                <span className="hidden md:block">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right: Command Palette trigger + Profile */}
        <div className="flex items-center gap-[var(--space-3)]">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[6px] text-xs transition-all"
            style={{
              color: "var(--text-tertiary)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <SearchIcon size={14} />
            <span className="hidden sm:block">Sök...</span>
            <kbd
              className="hidden sm:inline-flex items-center px-[6px] py-[2px] text-[10px] font-mono"
              style={{
                background: "var(--bg-elevated)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-tertiary)",
              }}
            >
              ⌘K
            </kbd>
          </button>

          {/* XP Badge */}
          <div
            className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[6px] text-xs font-mono"
            style={{
              color: "var(--xp-gold)",
              background: "rgba(251, 191, 36, 0.08)",
              borderRadius: "var(--radius-full)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
            }}
          >
            <FlameIcon size={14} />
            <span>0 XP</span>
          </div>

          {/* Avatar */}
          <div
            className="w-8 h-8 flex items-center justify-center text-xs font-medium"
            style={{
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            S
          </div>
        </div>
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}

/* ============================================================
   INLINE ICONS — Minimal, pixel-aligned SVGs
   ============================================================ */

function GridIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" fill={active ? "var(--accent)" : "currentColor"} opacity={active ? 1 : 0.6} />
      <rect x="9" y="2" width="5" height="5" rx="1" fill={active ? "var(--accent)" : "currentColor"} opacity={active ? 0.7 : 0.4} />
      <rect x="2" y="9" width="5" height="5" rx="1" fill={active ? "var(--accent)" : "currentColor"} opacity={active ? 0.7 : 0.4} />
      <rect x="9" y="9" width="5" height="5" rx="1" fill={active ? "var(--accent)" : "currentColor"} opacity={active ? 0.5 : 0.3} />
    </svg>
  );
}

function BookIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5">
      <path d="M2.5 3C2.5 2.5 3 2 4 2h3.5v12H4c-1 0-1.5-.5-1.5-1V3z" />
      <path d="M7.5 2H12c1 0 1.5.5 1.5 1v10c0 .5-.5 1-1.5 1H7.5V2z" />
    </svg>
  );
}

function TargetIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.75" fill={active ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}

function UsersIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <circle cx="11" cy="5.5" r="1.8" />
      <path d="M14.5 14c0-2 -1.5-3.2-3.5-3.5" />
    </svg>
  );
}

function MicIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5">
      <rect x="5.5" y="2" width="5" height="8" rx="2.5" />
      <path d="M3 8.5c0 2.5 2 4.5 5 4.5s5-2 5-4.5" />
      <path d="M8 13v2" />
    </svg>
  );
}

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function FlameIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1c0 2.5-3 4-3 7a4 4 0 008 0c0-2-1-3.5-2-4.5-.5 1.5-1.5 2-2 1.5C9 4 9 2.5 8 1z" />
    </svg>
  );
}
