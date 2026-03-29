"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, List, Zap, FolderOpen, MoreHorizontal, Pencil, Trash2, Plus, Command } from "lucide-react";
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
    <aside className="w-[240px] flex-shrink-0 h-screen flex flex-col bg-cockpit-bg border-r border-cockpit-border">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cockpit-text flex items-center justify-center">
            <Zap size={16} className="text-cockpit-bg" strokeWidth={2} />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-cockpit-text">telink</span>
            <span className="text-2xs block text-cockpit-text-dim font-medium tracking-wider uppercase">Dialer</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-cockpit-border" />

      {/* Call Lists Section */}
      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-2xs font-semibold tracking-wider uppercase text-cockpit-text-dim">Ringlistor</span>
          <span className="text-2xs font-mono text-cockpit-text-dim tabular-nums">{callLists.length}</span>
        </div>

        <div className="space-y-0.5">
          {callLists.map((list) => {
            const isActive = list.id === activeListId;
            const isEditing = list.id === editingId;

            return (
              <div
                key={list.id}
                className={`
                  group relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150
                  ${isActive
                    ? "bg-cockpit-surface border border-cockpit-border shadow-card"
                    : "hover:bg-cockpit-surface-hover"
                  }
                `}
              >
                <div className={`
                  w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors duration-150
                  ${isActive
                    ? "bg-cockpit-bg text-cockpit-text"
                    : "bg-cockpit-bg-subtle text-cockpit-text-muted group-hover:text-cockpit-text-secondary"
                  }
                `}>
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
                    className="flex-1 min-w-0 px-2 py-0.5 -my-0.5 bg-cockpit-surface border border-cockpit-border-strong rounded text-sm text-cockpit-text focus:outline-none focus:border-cockpit-border-focus"
                  />
                ) : (
                  <button
                    onClick={() => onListSelect(list.id)}
                    className={`flex-1 min-w-0 text-left truncate font-medium cursor-pointer transition-colors duration-150 ${
                      isActive ? "text-cockpit-text" : "text-cockpit-text-secondary group-hover:text-cockpit-text"
                    }`}
                  >
                    {list.name}
                  </button>
                )}

                <span className={`text-xs font-mono tabular-nums transition-colors duration-150 ${
                  isActive ? "text-cockpit-text-muted" : "text-cockpit-text-dim"
                }`}>
                  {list.contacts.length}
                </span>

                {!isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === list.id ? null : list.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-cockpit-bg rounded transition-all cursor-pointer text-cockpit-text-dim hover:text-cockpit-text"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                )}

                {menuOpen === list.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 w-36 py-1 bg-cockpit-surface border border-cockpit-border-strong rounded-lg shadow-elevation-3 z-50 animate-fade-down"
                  >
                    <button
                      onClick={() => handleStartEdit(list)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-cockpit-text hover:bg-cockpit-surface-hover transition-colors cursor-pointer"
                    >
                      <Pencil size={11} className="text-cockpit-text-muted" />
                      Byt namn
                    </button>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-cockpit-danger hover:bg-cockpit-danger-bg transition-colors cursor-pointer"
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
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
              ${view === "import"
                ? "bg-cockpit-surface border border-cockpit-border shadow-card text-cockpit-text"
                : "text-cockpit-text-muted hover:bg-cockpit-surface-hover hover:text-cockpit-text-secondary"
              }
              cursor-pointer group
            `}
          >
            <div className={`
              w-6 h-6 rounded flex items-center justify-center border border-dashed transition-colors duration-150
              ${view === "import"
                ? "border-cockpit-border-strong bg-cockpit-bg"
                : "border-cockpit-border group-hover:border-cockpit-border-strong"
              }
            `}>
              <Plus size={12} />
            </div>
            <span>Importera ny</span>
          </button>
        </div>
      </div>

      {/* Navigation - only show if we have an active list */}
      {hasData && (
        <>
          <div className="mx-4 h-px bg-cockpit-border" />

          <nav className="px-3 py-4">
            <div className="px-2 mb-3">
              <span className="text-2xs font-semibold tracking-wider uppercase text-cockpit-text-dim">Navigering</span>
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
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
                      ${active
                        ? "bg-cockpit-surface border border-cockpit-border shadow-card text-cockpit-text"
                        : disabled
                          ? "text-cockpit-text-dim cursor-not-allowed opacity-40"
                          : "text-cockpit-text-secondary hover:bg-cockpit-surface-hover hover:text-cockpit-text cursor-pointer"
                      }
                    `}
                  >
                    <div className={`
                      w-6 h-6 rounded flex items-center justify-center transition-colors duration-150
                      ${active
                        ? "bg-cockpit-bg text-cockpit-text"
                        : "bg-cockpit-bg-subtle text-cockpit-text-muted"
                      }
                    `}>
                      <item.icon size={12} />
                    </div>
                    {item.label}
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cockpit-success" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-4 mt-auto border-t border-cockpit-border">
        <div className="flex items-center gap-2 text-2xs text-cockpit-text-dim">
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
