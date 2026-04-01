"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Search, Upload, Play, MoreHorizontal, Pencil, Trash2,
  FolderOpen, ChevronUp, ChevronDown, X, Plus, FileText,
  CheckSquare, Square,
} from "lucide-react";
import type { CallList } from "@/types";

interface ListsViewProps {
  callLists: CallList[];
  activeListId: string | null;
  onSelectList: (listId: string) => void;
  onStartDialer: (listId: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameList: (listId: string, newName: string) => void;
  onImportNew: () => void;
}

type SortField = "name" | "contacts" | "progress" | "createdAt";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "idle" | "active" | "done";

function getListStatus(list: CallList): "idle" | "active" | "done" {
  const total = list.contacts.length;
  if (total === 0) return "idle";
  const called = list.contacts.filter((c) => c.status !== "ej_ringd").length;
  if (called === 0) return "idle";
  if (called === total) return "done";
  return "active";
}

const STATUS_BADGE: Record<"idle" | "active" | "done", { label: string; bg: string; color: string }> = {
  idle: { label: "Ej startad", bg: "var(--bg-subtle)", color: "var(--text-muted)" },
  active: { label: "Pågående", bg: "rgba(99,102,241,0.15)", color: "rgb(165,180,252)" },
  done: { label: "Klar", bg: "rgba(34,197,94,0.15)", color: "rgb(134,239,172)" },
};

function StatusBadge({ status }: { status: "idle" | "active" | "done" }) {
  const cfg = STATUS_BADGE[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function SortBtn({
  field,
  sortField,
  sortDir,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider transition-colors"
      style={{ color: active ? "var(--text-secondary)" : "var(--text-dim)" }}
    >
      {children}
      {active ? (
        sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : null}
    </button>
  );
}

export function ListsView({
  callLists,
  activeListId,
  onSelectList,
  onStartDialer,
  onDeleteList,
  onRenameList,
  onImportNew,
}: ListsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    let lists = [...callLists];

    if (search) {
      const q = search.toLowerCase();
      lists = lists.filter((l) => l.name.toLowerCase().includes(q));
    }

    if (statusFilter !== "all") {
      lists = lists.filter((l) => getListStatus(l) === statusFilter);
    }

    lists.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "sv");
      } else if (sortField === "contacts") {
        cmp = a.contacts.length - b.contacts.length;
      } else if (sortField === "progress") {
        const aPct = a.contacts.length
          ? a.contacts.filter((c) => c.status !== "ej_ringd").length / a.contacts.length
          : 0;
        const bPct = b.contacts.length
          ? b.contacts.filter((c) => c.status !== "ej_ringd").length / b.contacts.length
          : 0;
        cmp = aPct - bPct;
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return lists;
  }, [callLists, search, statusFilter, sortField, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const someSelected = filtered.some((l) => selected.has(l.id));
  const selectedCount = Array.from(selected).filter((id) => filtered.some((l) => l.id === id)).length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const handleSingleDelete = (id: string) => {
    setConfirmDelete([id]);
    setMenuOpen(null);
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selected).filter((id) => filtered.some((l) => l.id === id));
    setConfirmDelete(ids);
  };

  const handleDeleteConfirm = () => {
    if (!confirmDelete) return;
    confirmDelete.forEach((id) => onDeleteList(id));
    setSelected(new Set());
    setConfirmDelete(null);
  };

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Alla" },
    { key: "idle", label: "Ej startad" },
    { key: "active", label: "Pågående" },
    { key: "done", label: "Klar" },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-6" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Ringlistor
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              {callLists.length} {callLists.length === 1 ? "lista" : "listor"}
            </p>
          </div>
          <button onClick={onImportNew} className="btn-primary">
            <Upload size={14} />
            Importera ny lista
          </button>
        </div>

        {/* Search + Status filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-dim)" }}
            />
            <input
              type="text"
              placeholder="Sök lista..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg focus:outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
                style={{ color: "var(--text-dim)" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: statusFilter === f.key ? "var(--surface)" : undefined,
                  border: statusFilter === f.key ? "1px solid var(--border-strong)" : "1px solid transparent",
                  color: statusFilter === f.key ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {someSelected && (
        <div
          className="px-8 py-2.5 flex items-center gap-3 animate-fade-down"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
            {selectedCount} {selectedCount === 1 ? "lista vald" : "listor valda"}
          </span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}
          >
            <Trash2 size={12} />
            Ta bort valda
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            Avmarkera alla
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {callLists.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--surface)" }}
            >
              <FolderOpen size={28} style={{ color: "var(--text-dim)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Inga ringlistor ännu
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Importera en CSV-fil för att komma igång
              </p>
            </div>
            <button onClick={onImportNew} className="btn-primary">
              <Plus size={14} />
              Importera ringlista
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* No search results */
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Inga listor matchar sökningen
            </p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
              className="text-xs transition-colors"
              style={{ color: "var(--text-dim)" }}
            >
              Rensa filter
            </button>
          </div>
        ) : (
          /* Table */
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="w-12 px-4 py-3 text-left">
                  <button
                    onClick={toggleAll}
                    className="transition-colors"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <SortBtn field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                    Namn
                  </SortBtn>
                </th>
                <th className="px-4 py-3 text-left w-28">
                  <SortBtn field="contacts" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                    Kontakter
                  </SortBtn>
                </th>
                <th className="px-4 py-3 text-left w-52">
                  <SortBtn field="progress" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                    Framsteg
                  </SortBtn>
                </th>
                <th className="px-4 py-3 text-left w-32">
                  <span
                    className="text-2xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Status
                  </span>
                </th>
                <th className="px-4 py-3 text-left w-28">
                  <SortBtn field="createdAt" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                    Skapad
                  </SortBtn>
                </th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((list) => {
                const isActive = list.id === activeListId;
                const isEditing = list.id === editingId;
                const total = list.contacts.length;
                const called = list.contacts.filter((c) => c.status !== "ej_ringd").length;
                const pct = total > 0 ? Math.round((called / total) * 100) : 0;
                const status = getListStatus(list);
                const isSelected = selected.has(list.id);

                return (
                  <tr
                    key={list.id}
                    className="group transition-colors"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: isSelected
                        ? "var(--surface)"
                        : isActive
                        ? "rgba(99,102,241,0.04)"
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isActive)
                        e.currentTarget.style.background = "var(--surface-hover, rgba(255,255,255,0.03))";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isActive) e.currentTarget.style.background = "";
                    }}
                  >
                    {/* Checkbox */}
                    <td className="w-12 px-4 py-3.5">
                      <button
                        onClick={() => toggleOne(list.id)}
                        className="transition-opacity"
                        style={{
                          color: isSelected ? "var(--text)" : "var(--text-dim)",
                          opacity: isSelected ? 1 : undefined,
                        }}
                      >
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </button>
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isActive ? "rgba(99,102,241,0.2)" : "var(--bg-subtle)",
                            color: isActive ? "rgb(165,180,252)" : "var(--text-muted)",
                          }}
                        >
                          <FileText size={12} />
                        </div>

                        {isEditing ? (
                          <input
                            ref={editInputRef}
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
                            className="px-2 py-0.5 rounded text-sm focus:outline-none"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border-strong)",
                              color: "var(--text)",
                              minWidth: "180px",
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => onSelectList(list.id)}
                            className="text-sm font-medium text-left truncate hover:underline cursor-pointer"
                            style={{ color: "var(--text)" }}
                          >
                            {list.name}
                          </button>
                        )}

                        {isActive && !isEditing && (
                          <span
                            className="text-2xs px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: "rgba(99,102,241,0.15)", color: "rgb(165,180,252)" }}
                          >
                            Aktiv
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Contacts */}
                    <td className="px-4 py-3.5 w-28">
                      <span
                        className="text-sm font-mono tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {total.toLocaleString("sv-SE")}
                      </span>
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-3.5 w-52">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: "var(--border)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: pct === 100 ? "var(--success)" : "rgb(99,102,241)",
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-mono tabular-nums flex-shrink-0 w-14 text-right"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {called}/{total}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 w-32">
                      <StatusBadge status={status} />
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3.5 w-28">
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {new Date(list.createdAt).toLocaleDateString("sv-SE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 w-36">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onStartDialer(list.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                          }}
                        >
                          <Play size={11} fill="currentColor" />
                          Starta
                        </button>

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(menuOpen === list.id ? null : list.id);
                            }}
                            className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            style={{ color: "var(--text-dim)" }}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {menuOpen === list.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg shadow-elevation-3 z-50 animate-fade-down"
                              style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border-strong)",
                              }}
                            >
                              <button
                                onClick={() => handleStartEdit(list)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer"
                                style={{ color: "var(--text)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                              >
                                <Pencil size={11} style={{ color: "var(--text-muted)" }} />
                                Byt namn
                              </button>
                              <div className="h-px my-1" style={{ background: "var(--border)" }} />
                              <button
                                onClick={() => handleSingleDelete(list.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer"
                                style={{ color: "var(--danger)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                              >
                                <Trash2 size={11} />
                                Ta bort
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div
            className="w-full max-w-sm mx-4 p-6 rounded-2xl animate-fade-up"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text)" }}>
              Ta bort {confirmDelete.length === 1 ? "ringlista" : `${confirmDelete.length} ringlistor`}?
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Detta går inte att ångra. All data och alla kontakter i{" "}
              {confirmDelete.length === 1 ? "listan" : "listorna"} tas bort permanent.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary">
                Avbryt
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: "var(--danger)", color: "white" }}
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
