"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, List, Zap, FolderOpen, MoreHorizontal, Pencil, Trash2, Plus, Sparkles } from "lucide-react";
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
    <aside className="w-[240px] flex-shrink-0 h-screen flex flex-col bg-telink-bg-subtle/50">
      {/* Logo with gradient accent */}
      <div className="px-5 pt-7 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-telink-accent via-pink-500 to-telink-violet flex items-center justify-center shadow-glow-sm">
              <Zap size={18} className="text-telink-bg" strokeWidth={2.5} />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-telink-success border-2 border-telink-bg-subtle animate-pulse" />
          </div>
          <div>
            <span className="font-semibold text-base tracking-tight text-telink-text">telink</span>
            <span className="text-2xs block text-telink-muted font-medium tracking-wider uppercase">Dialer Pro</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-telink-border to-transparent" />

      {/* Call Lists Section */}
      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-2xs font-semibold tracking-wider uppercase text-telink-dim">Ringlistor</span>
          <span className="text-2xs font-mono text-telink-dim">{callLists.length}</span>
        </div>

        <div className="space-y-1">
          {callLists.map((list) => {
            const isActive = list.id === activeListId;
            const isEditing = list.id === editingId;

            return (
              <div
                key={list.id}
                className={`
                  group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ease-out-expo
                  ${isActive
                    ? "bg-telink-accent-muted shadow-inner-glow"
                    : "hover:bg-telink-surface-hover"
                  }
                `}
              >
                <div className={`
                  w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200
                  ${isActive
                    ? "bg-telink-accent/20 text-telink-accent"
                    : "bg-telink-surface text-telink-muted group-hover:text-telink-text-secondary"
                  }
                `}>
                  <FolderOpen size={14} />
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
                    className="flex-1 min-w-0 px-2 py-1 -my-1 bg-telink-surface border border-telink-accent rounded-lg text-sm text-telink-text focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => onListSelect(list.id)}
                    className={`flex-1 min-w-0 text-left truncate font-medium cursor-pointer transition-colors duration-150 ${
                      isActive ? "text-telink-accent" : "text-telink-text-secondary group-hover:text-telink-text"
                    }`}
                  >
                    {list.name}
                  </button>
                )}

                <span className={`text-xs font-mono tabular-nums transition-colors duration-150 ${
                  isActive ? "text-telink-accent/70" : "text-telink-dim"
                }`}>
                  {list.contacts.length}
                </span>

                {!isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === list.id ? null : list.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-telink-surface rounded-md transition-all cursor-pointer text-telink-dim hover:text-telink-text"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}

                {menuOpen === list.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 w-40 py-1.5 bg-telink-surface-elevated border border-telink-border rounded-xl shadow-elevation-3 z-50 animate-fade-down"
                  >
                    <button
                      onClick={() => handleStartEdit(list)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-telink-text hover:bg-telink-surface-hover transition-colors cursor-pointer"
                    >
                      <Pencil size={13} className="text-telink-muted" />
                      Byt namn
                    </button>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
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
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
              ${view === "import"
                ? "bg-telink-violet-muted text-telink-violet"
                : "text-telink-dim hover:bg-telink-surface-hover hover:text-telink-text-secondary"
              }
              cursor-pointer group
            `}
          >
            <div className={`
              w-7 h-7 rounded-lg flex items-center justify-center border border-dashed transition-all duration-200
              ${view === "import"
                ? "border-telink-violet/50 bg-telink-violet/10"
                : "border-telink-border group-hover:border-telink-border-light"
              }
            `}>
              <Plus size={14} />
            </div>
            <span>Importera ny</span>
          </button>
        </div>
      </div>

      {/* Navigation - only show if we have an active list */}
      {hasData && (
        <>
          <div className="mx-4 h-px bg-gradient-to-r from-transparent via-telink-border to-transparent" />

          <nav className="px-3 py-4">
            <div className="px-2 mb-3">
              <span className="text-2xs font-semibold tracking-wider uppercase text-telink-dim">Navigering</span>
            </div>

            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const disabled = item.needsData && !hasData;
                const active = view === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => !disabled && setView(item.key)}
                    disabled={disabled}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out-expo
                      ${active
                        ? "bg-telink-accent-muted text-telink-accent shadow-inner-glow"
                        : disabled
                          ? "text-telink-dim cursor-not-allowed opacity-40"
                          : "text-telink-text-secondary hover:bg-telink-surface-hover hover:text-telink-text cursor-pointer"
                      }
                    `}
                  >
                    <div className={`
                      w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200
                      ${active
                        ? "bg-telink-accent/20"
                        : "bg-telink-surface"
                      }
                    `}>
                      <item.icon size={14} />
                    </div>
                    {item.label}
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-telink-accent shadow-glow-sm" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-4 mt-auto">
        <div className="p-3 rounded-xl bg-gradient-to-br from-telink-surface to-telink-surface-elevated border border-telink-border">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-telink-accent" />
            <span className="text-xs font-medium text-telink-text">Pro Tips</span>
          </div>
          <p className="text-2xs text-telink-muted leading-relaxed">
            Tryck <kbd>Space</kbd> för snabbsamtal eller <kbd>?</kbd> för alla genvägar.
          </p>
        </div>
      </div>
    </aside>
  );
}
