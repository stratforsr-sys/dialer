"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
  section: string;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    // Navigation
    { id: "nav-dashboard", label: "Dashboard", description: "Översikt och stats", icon: "grid", action: () => router.push("/"), section: "Navigation" },
    { id: "nav-modules", label: "Moduler", description: "Kunskapsbas", icon: "book", action: () => router.push("/modules"), section: "Navigation" },
    { id: "nav-practice", label: "Öva", description: "Starta övningssession", icon: "target", action: () => router.push("/practice"), section: "Navigation" },
    { id: "nav-roleplay", label: "Rollspel", description: "AI-köpare", icon: "users", action: () => router.push("/roleplay"), section: "Navigation" },
    { id: "nav-meetings", label: "Mötesanalys", description: "Analysera riktiga möten", icon: "mic", action: () => router.push("/meetings"), section: "Navigation" },
    // Actions
    { id: "act-new-module", label: "Ny modul", description: "Ladda upp anteckningar", icon: "plus", action: () => router.push("/modules/new"), section: "Åtgärder" },
    { id: "act-quick-practice", label: "Snabbövning", description: "Öva svagaste tekniker", icon: "zap", action: () => router.push("/practice?mode=quick"), section: "Åtgärder" },
    { id: "act-new-roleplay", label: "Nytt rollspel", description: "Starta AI-samtal", icon: "play", action: () => router.push("/roleplay/new"), section: "Åtgärder" },
    { id: "act-upload-meeting", label: "Ladda upp möte", description: "Analysera transkript", icon: "upload", action: () => router.push("/meetings/new"), section: "Åtgärder" },
  ];

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const sections = [...new Set(filtered.map((c) => c.section))];

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      cmd.action();
      onClose();
      setQuery("");
      setSelectedIndex(0);
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        executeCommand(filtered[selectedIndex]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, filtered, selectedIndex, executeCommand]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="fixed top-[20%] left-1/2 z-[101] w-[560px] max-w-[90vw] -translate-x-1/2 overflow-hidden"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
            {/* Input */}
            <div
              className="flex items-center gap-[var(--space-3)] px-[var(--space-5)] h-14"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Sök kommandon..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                style={{ color: "var(--text-primary)" }}
              />
              <kbd
                className="px-[6px] py-[2px] text-[10px] font-mono"
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-tertiary)",
                }}
              >
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto py-[var(--space-2)]">
              {sections.map((section) => (
                <div key={section}>
                  <div
                    className="px-[var(--space-5)] py-[var(--space-2)] text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {section}
                  </div>
                  {filtered
                    .filter((c) => c.section === section)
                    .map((cmd) => {
                      const globalIndex = filtered.indexOf(cmd);
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className="w-full flex items-center gap-[var(--space-3)] px-[var(--space-5)] py-[var(--space-3)] text-left transition-colors"
                          style={{
                            background: isSelected ? "var(--bg-elevated)" : "transparent",
                            color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                          }}
                        >
                          <CmdIcon type={cmd.icon} active={isSelected} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{cmd.label}</div>
                            {cmd.description && (
                              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {cmd.description}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                              ↵
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="px-[var(--space-5)] py-[var(--space-8)] text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Inga resultat för &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function CmdIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "var(--accent)" : "var(--text-tertiary)";
  const size = 16;

  switch (type) {
    case "grid":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" opacity="0.5" />
          <rect x="2" y="9" width="5" height="5" rx="1" opacity="0.5" />
          <rect x="9" y="9" width="5" height="5" rx="1" opacity="0.3" />
        </svg>
      );
    case "book":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <path d="M2.5 3C2.5 2.5 3 2 4 2h3.5v12H4c-1 0-1.5-.5-1.5-1V3z" />
          <path d="M7.5 2H12c1 0 1.5.5 1.5 1v10c0 .5-.5 1-1.5 1H7.5V2z" />
        </svg>
      );
    case "target":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.75" fill={color} />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <circle cx="6" cy="5" r="2.5" /><path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
        </svg>
      );
    case "mic":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <rect x="5.5" y="2" width="5" height="8" rx="2.5" /><path d="M3 8.5c0 2.5 2 4.5 5 4.5s5-2 5-4.5" /><path d="M8 13v2" />
        </svg>
      );
    case "plus":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
      );
    case "zap":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
        </svg>
      );
    case "play":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
        </svg>
      );
    case "upload":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <path d="M8 10V3M5 5l3-3 3 3M3 13h10" />
        </svg>
      );
    default:
      return <div style={{ width: size, height: size }} />;
  }
}
