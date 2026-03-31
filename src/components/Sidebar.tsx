"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, List, Zap, FolderOpen, MoreHorizontal, Pencil, Trash2, Plus, Command, BarChart3, Settings, FlaskConical } from "lucide-react";
import type { ViewMode, CallList } from "@/types";

interface SidebarProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  hasData: boolean;
  listName: string;
  contactCount: number;
  callLists: CallList[];
  activeListId: string | null;
  onListSelect: (listId: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameList: (listId: string, newName: string) => void;
}

const NAV_ITEMS: { key: ViewMode; label: string; icon: typeof LayoutDashboard; needsData?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, needsData: true },
  { key: "list", label: "Kontakter", icon: List, needsData: true },
  { key: "cockpit", label: "Dialer", icon: Zap, needsData: true },
  { key: "stats", label: "Statistik", icon: BarChart3, needsData: true },
  { key: "research", label: "Research", icon: FlaskConical, needsData: false },
  { key: "settings", label: "Inställningar", icon: Settings, needsData: false },
];

export function Sidebar({
  view,
  setView,
  hasData,
  callLists,
  activeListId,
  onListSelect,
  onDeleteList,
  onRenameList,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleStartEdit = (list: CallList) => {
    setEditingId(list.id);
    setEditName(list.name);
    setMenuOpen(null);
  };

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      onRenameList(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = (listId: string) => {
    if (confirm("Är du säker på att du vill ta bort denna ringlista?")) {
      onDeleteList(listId);
    }
    setMenuOpen(null);
  };

  return (
    <aside className="w-[240px] flex-shrink-0 h-screen flex flex-col" style={{ background: "var(--bg)", borderRight: "1px solid var(--border)" }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--text)" }}>
            <Zap size={16} style={{ color: "var(--bg)" }} strokeWidth={2} />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight" style={{ color: "var(--text)" }}>telink</span>
            <span className="text-2xs block font-medium tracking-wider uppercase" style={{ color: "var(--text-dim)" }}>Dialer</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: "var(--border)" }} />

      {/* Call Lists Section */}
      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-2xs font-semibold tracking-wider uppercase" style={{ color: "var(--text-dim)" }}>Ringlistor</span>
          <span className="text-2xs font-mono tabular-nums" style={{ color: "var(--text-dim)" }}>{callLists.length}</span>
        </div>

        <div className="space-y-0.5">
          {callLists.map((list) => {
            const isActive = list.id === activeListId;
            const isEditing = list.id === editingId;

            return (
              <div
                key={list.id}
                className="group relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150"
                style={{
                  background: isActive ? "var(--surface)" : undefined,
                  border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                  boxShadow: isActive ? "var(--shadow-sm)" : undefined,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = ""; }}
              >
                <div
                  className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors duration-150"
                  style={{
                    background: isActive ? "var(--bg)" : "var(--bg-subtle)",
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  <FolderOpen size={12} />
                </div>

                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditName("");
                      }
                    }}
                    className="flex-1 min-w-0 px-2 py-0.5 -my-0.5 rounded text-sm focus:outline-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                    }}
                  />
                ) : (
                  <button
                    onClick={() => onListSelect(list.id)}
                    className="flex-1 min-w-0 text-left truncate font-medium cursor-pointer transition-colors duration-150"
                    style={{ color: isActive ? "var(--text)" : "var(--text-secondary)" }}
                  >
                    {list.name}
                  </button>
                )}

                <span
                  className="text-xs font-mono tabular-nums transition-colors duration-150"
                  style={{ color: isActive ? "var(--text-muted)" : "var(--text-dim)" }}
                >
                  {list.contacts.length}
                </span>

                {!isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === list.id ? null : list.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all cursor-pointer"
                    style={{ color: "var(--text-dim)" }}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                )}

                {menuOpen === list.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg shadow-elevation-3 z-50 animate-fade-down"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
                  >
                    <button
                      onClick={() => handleStartEdit(list)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer"
                      style={{ color: "var(--text)" }}
                    >
                      <Pencil size={11} style={{ color: "var(--text-muted)" }} />
                      Byt namn
                    </button>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={11} />
                      Ta bort
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Import new list button */}
          <button
            onClick={() => setView("import")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer group"
            style={{
              background: view === "import" ? "var(--surface)" : undefined,
              border: view === "import" ? "1px solid var(--border)" : "1px solid transparent",
              boxShadow: view === "import" ? "var(--shadow-sm)" : undefined,
              color: view === "import" ? "var(--text)" : "var(--text-muted)",
            }}
          >
            <div
              className="w-6 h-6 rounded flex items-center justify-center border border-dashed transition-colors duration-150"
              style={{
                borderColor: view === "import" ? "var(--border-strong)" : "var(--border)",
                background: view === "import" ? "var(--bg)" : undefined,
              }}
            >
              <Plus size={12} />
            </div>
            <span>Importera ny</span>
          </button>
        </div>
      </div>

      {/* Navigation - always visible, data-dependent items are disabled */}
      <>
        <div className="mx-4 h-px" style={{ background: "var(--border)" }} />

          <nav className="px-3 py-4">
            <div className="px-2 mb-3">
              <span className="text-2xs font-semibold tracking-wider uppercase" style={{ color: "var(--text-dim)" }}>Navigering</span>
            </div>

            <div className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const disabled = item.needsData && !hasData;
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
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
      </>

      {/* Footer */}
      <div className="px-4 py-4 mt-auto" style={{ borderTop: "1px solid var(--border)" }}>
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
