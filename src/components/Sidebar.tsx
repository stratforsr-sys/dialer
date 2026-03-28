"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, LayoutDashboard, List, Zap, FolderOpen, MoreHorizontal, Pencil, Trash2, Plus } from "lucide-react";
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

const NAV_ITEMS: { key: ViewMode; label: string; icon: typeof Upload; needsData?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, needsData: true },
  { key: "list", label: "Kontakter", icon: List, needsData: true },
  { key: "cockpit", label: "Dialer", icon: Zap, needsData: true },
];

export function Sidebar({
  view,
  setView,
  hasData,
  listName,
  contactCount,
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when editing
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

      {/* Call Lists Section */}
      <div className="px-3 mb-4">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-telink-dim px-2 mb-2">Ringlistor</div>
        <div className="space-y-0.5">
          {callLists.map((list) => {
            const isActive = list.id === activeListId;
            const isEditing = list.id === editingId;

            return (
              <div
                key={list.id}
                className={`
                  group relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-150
                  ${isActive
                    ? "bg-[rgba(43,181,116,0.10)] text-[#2bb574]"
                    : "text-telink-muted hover:bg-telink-surface-hover hover:text-telink-text"
                  }
                `}
              >
                <FolderOpen size={14} className="flex-shrink-0" />

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
                    className="flex-1 min-w-0 px-1 py-0.5 -my-0.5 bg-telink-surface-light border border-telink-border rounded text-sm text-telink-text focus:outline-none focus:border-[#2bb574]"
                  />
                ) : (
                  <button
                    onClick={() => onListSelect(list.id)}
                    className="flex-1 min-w-0 text-left truncate font-medium cursor-pointer"
                  >
                    {list.name}
                  </button>
                )}

                <span className="text-xs text-telink-dim">
                  {list.contacts.length}
                </span>

                {/* Menu trigger */}
                {!isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === list.id ? null : list.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-telink-surface-light rounded transition-all cursor-pointer"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}

                {/* Active indicator */}
                {isActive && !isEditing && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2bb574]" />
                )}

                {/* Dropdown menu */}
                {menuOpen === list.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 w-36 py-1 bg-telink-surface border border-telink-border rounded-lg shadow-lg z-50"
                  >
                    <button
                      onClick={() => handleStartEdit(list)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-telink-text hover:bg-telink-surface-hover transition-colors cursor-pointer"
                    >
                      <Pencil size={13} />
                      Byt namn
                    </button>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-telink-surface-hover transition-colors cursor-pointer"
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
              w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150
              ${view === "import"
                ? "bg-[rgba(43,181,116,0.10)] text-[#2bb574]"
                : "text-telink-dim hover:bg-telink-surface-hover hover:text-telink-muted"
              }
              cursor-pointer
            `}
          >
            <Plus size={14} />
            <span>Importera ny</span>
          </button>
        </div>
      </div>

      {/* Nav - only show if we have an active list */}
      {hasData && (
        <nav className="flex-1 px-3 space-y-0.5">
          <div className="text-[10px] font-semibold tracking-widest uppercase text-telink-dim px-2 mb-2">Navigering</div>
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
      )}

      {/* Spacer if no data */}
      {!hasData && <div className="flex-1" />}

      {/* Footer */}
      <div className="p-4 border-t border-telink-border">
        <div className="text-[10px] text-telink-dim text-center">
          Telink AB © {new Date().getFullYear()}
        </div>
      </div>
    </aside>
  );
}
