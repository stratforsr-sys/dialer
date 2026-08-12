"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Upload, Play, MoreHorizontal, Pencil, Trash2, FolderOpen,
  X, FileText, Users, Lock, ChevronRight,
} from "lucide-react";
import type { ListSummary } from "@/app/actions/lists";
import { deleteList, renameList } from "@/app/actions/lists";
import { ShareListModal } from "./ShareListModal";
import { LeadSearchResults } from "./LeadSearchResults";

type UserOption = { id: string; name: string; email: string; role: string };

type StatusFilter = "all" | "idle" | "active" | "done";

function listStatus(l: ListSummary): "idle" | "active" | "done" {
  if (l.totalLeads === 0) return "idle";
  if (l.workedLeads === 0) return "idle";
  if (l.freeLeads === 0) return "done";
  return "active";
}

const STATUS_BADGE: Record<"idle" | "active" | "done", { label: string; bg: string; color: string }> = {
  idle: { label: "Ej startad", bg: "var(--surface-inset)", color: "var(--text-dim)" },
  active: { label: "Pågående", bg: "var(--accent-muted)", color: "var(--accent)" },
  done: { label: "Slut på leads", bg: "var(--success-bg)", color: "var(--success)" },
};

function StatusBadge({ status }: { status: "idle" | "active" | "done" }) {
  const cfg = STATUS_BADGE[status];
  return (
    <span
      className="inline-flex items-center px-2 py-[3px] rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

/** Överlappande initialer för säljarna på en mapp. */
function MemberStack({ members }: { members: { id: string; name: string }[] }) {
  if (members.length === 0) {
    return (
      <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
        Ingen tilldelad
      </span>
    );
  }
  const shown = members.slice(0, 4);
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <div
          key={m.id}
          title={m.name}
          className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{
            background: "var(--surface-inset)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-secondary)",
            marginLeft: i === 0 ? 0 : -6,
            zIndex: shown.length - i,
          }}
        >
          {m.name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {members.length > 4 && (
        <span className="text-[11px] ml-2" style={{ color: "var(--text-dim)" }}>
          +{members.length - 4}
        </span>
      )}
    </div>
  );
}

export function ListsBoard({
  lists,
  users,
  isAdmin,
}: {
  lists: ListSummary[];
  users: UserOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ListSummary | null>(null);
  // Vad borttagningen faktiskt gjorde. Visas efteråt: siffrorna går inte att
  // räkna ut i förväg utan ett extra serveranrop, och de är det enda sättet
  // att se att dubbletterna verkligen skonades.
  const [deleteResult, setDeleteResult] = useState<
    { name: string; deletedLeads: number; keptDuplicates: number; keptInOtherLists: number } | null
  >(null);
  const [shareList, setShareList] = useState<ListSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    let out = [...lists];
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((l) => l.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      out = out.filter((l) => listStatus(l) === statusFilter);
    }
    return out;
  }, [lists, search, statusFilter]);

  const totals = useMemo(
    () => ({
      leads: lists.reduce((s, l) => s + l.totalLeads, 0),
      free: lists.reduce((s, l) => s + l.freeLeads, 0),
    }),
    [lists]
  );

  function saveRename() {
    const id = editingId;
    const name = editName.trim();
    setEditingId(null);
    if (!id || !name) return;
    startTransition(async () => {
      await renameList(id, name);
      router.refresh();
    });
  }

  function confirmDeleteList() {
    const list = confirmDelete;
    setConfirmDelete(null);
    if (!list) return;
    startTransition(async () => {
      const res = await deleteList(list.id);
      setDeleteResult({ name: list.name, ...res });
      router.refresh();
    });
  }

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Alla" },
    { key: "idle", label: "Ej startad" },
    { key: "active", label: "Pågående" },
    { key: "done", label: "Slut på leads" },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-6" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Ringlistor
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
              {lists.length} {lists.length === 1 ? "mapp" : "mappar"} ·{" "}
              {totals.leads.toLocaleString("sv-SE")} leads ·{" "}
              <span style={{ color: "var(--accent)" }}>
                {totals.free.toLocaleString("sv-SE")} lediga att ringa
              </span>
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => router.push("/import")}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-md"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              <Upload size={14} />
              Ladda upp lista
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-dim)" }}
            />
            <input
              type="text"
              placeholder="Sök mapp eller lead…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-[13px] rounded-md focus:outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded"
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
                className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
                style={{
                  background: statusFilter === f.key ? "var(--surface)" : undefined,
                  border: `1px solid ${statusFilter === f.key ? "var(--border-strong)" : "transparent"}`,
                  color: statusFilter === f.key ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Innehåll ── */}
      <div className="flex-1 overflow-y-auto" style={{ opacity: isPending ? 0.6 : 1 }}>
        {/* Leadträffar först. Söker man på ett bolagsnamn är det bolaget man
            vill åt — mapparna nedanför är kvar som sammanhang, inte som svar. */}
        {search.trim().length >= 2 && (
          <div className="px-6 pt-6">
            <LeadSearchResults query={search} />
          </div>
        )}

        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <FolderOpen size={26} style={{ color: "var(--text-dim)" }} />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                {isAdmin ? "Inga ringlistor ännu" : "Du har inga listor tilldelade"}
              </p>
              <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
                {isAdmin
                  ? "Ladda upp en CSV så skapas en mapp du kan dela ut."
                  : "Be en admin att tilldela dig en lista att jobba på."}
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Inga mappar matchar sökningen
            </p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
              className="text-[12px]"
              style={{ color: "var(--accent)" }}
            >
              Rensa filter
            </button>
          </div>
        ) : (
          <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {filtered.map((list, i) => {
              const status = listStatus(list);
              const pct = list.totalLeads > 0
                ? Math.round(((list.totalLeads - list.freeLeads) / list.totalLeads) * 100)
                : 0;
              const isEditing = editingId === list.id;

              return (
                <motion.div
                  key={list.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.3) }}
                  className="group relative flex flex-col rounded-lg overflow-hidden"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* Kort-header */}
                  <div className="p-5 pb-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: status === "active" ? "var(--accent-muted)" : "var(--surface-inset)",
                          color: status === "active" ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        <FileText size={15} />
                      </div>

                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            ref={editRef}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={saveRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-full px-2 py-1 rounded-sm text-[14px] focus:outline-none"
                            style={{
                              background: "var(--surface-inset)",
                              border: "1px solid var(--accent)",
                              color: "var(--text)",
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => router.push(`/lists/${list.id}`)}
                            className="text-[14px] font-semibold text-left truncate block w-full hover:underline"
                            style={{ color: "var(--text)" }}
                          >
                            {list.name}
                          </button>
                        )}
                        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-dim)" }}>
                          {new Date(list.createdAt).toLocaleDateString("sv-SE", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                          {list.sourceFile ? ` · ${list.sourceFile}` : ""}
                        </p>
                      </div>

                      {isAdmin && !list.isSystem && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(menuOpen === list.id ? null : list.id);
                            }}
                            className="p-1.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: "var(--text-dim)" }}
                          >
                            <MoreHorizontal size={15} />
                          </button>

                          {menuOpen === list.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-1 w-44 py-1 rounded-md z-50"
                              style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border-strong)",
                                boxShadow: "var(--shadow-2)",
                              }}
                            >
                              <button
                                onClick={() => {
                                  setEditingId(list.id);
                                  setEditName(list.name);
                                  setMenuOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px]"
                                style={{ color: "var(--text)" }}
                              >
                                <Pencil size={11} style={{ color: "var(--text-muted)" }} />
                                Byt namn
                              </button>
                              <button
                                onClick={() => {
                                  setShareList(list);
                                  setMenuOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px]"
                                style={{ color: "var(--text)" }}
                              >
                                <Users size={11} style={{ color: "var(--text-muted)" }} />
                                Hantera åtkomst
                              </button>
                              <div className="h-px my-1" style={{ background: "var(--border)" }} />
                              <button
                                onClick={() => {
                                  setConfirmDelete(list);
                                  setMenuOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px]"
                                style={{ color: "var(--danger)" }}
                              >
                                <Trash2 size={11} />
                                Ta bort mapp
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Framsteg */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {(list.totalLeads - list.freeLeads).toLocaleString("sv-SE")} av{" "}
                          {list.totalLeads.toLocaleString("sv-SE")} tagna
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      <div
                        className="h-[5px] rounded-full overflow-hidden"
                        style={{ background: "var(--surface-inset)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: pct === 100 ? "var(--success)" : "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fot */}
                  <div
                    className="mt-auto px-5 py-3 flex items-center justify-between gap-3"
                    style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-inset)" }}
                  >
                    <MemberStack members={list.members} />

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => router.push(`/lists/${list.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Öppna
                        <ChevronRight size={12} />
                      </button>
                      <button
                        onClick={() => router.push(`/cockpit?listId=${list.id}`)}
                        disabled={list.freeLeads === 0}
                        title={list.freeLeads === 0 ? "Inga lediga leads kvar i mappen" : undefined}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-opacity"
                        style={{
                          background: "var(--accent)",
                          color: "var(--bg)",
                          opacity: list.freeLeads === 0 ? 0.4 : 1,
                          cursor: list.freeLeads === 0 ? "not-allowed" : "pointer",
                        }}
                      >
                        {list.freeLeads === 0 ? <Lock size={11} /> : <Play size={11} fill="currentColor" />}
                        Starta dialer
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bekräfta borttagning ── */}
      {deleteResult && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-4)" }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>
            ”{deleteResult.name}” borttagen
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {deleteResult.deletedLeads} lead{deleteResult.deletedLeads === 1 ? "" : "s"} borttagna.
            {deleteResult.keptDuplicates > 0 &&
              ` ${deleteResult.keptDuplicates} fanns redan innan importen och ligger kvar.`}
            {deleteResult.keptInOtherLists > 0 &&
              ` ${deleteResult.keptInOtherLists} sparades eftersom de även ligger i en annan mapp.`}
          </p>
          <button onClick={() => setDeleteResult(null)}
            className="mt-2 text-[11px] font-medium" style={{ color: "var(--accent)" }}>
            Stäng
          </button>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div
            className="w-full max-w-sm mx-4 p-6 rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
          >
            <h3 className="text-[16px] font-semibold mb-2" style={{ color: "var(--text)" }}>
              Ta bort ”{confirmDelete.name}”?
            </h3>
            <p className="text-[13px] mb-3" style={{ color: "var(--text-muted)" }}>
              Leadsen som <strong style={{ color: "var(--text-secondary)" }}>den här importen skapade</strong> tas
              bort med mappen — tillsammans med deras kontakter, anteckningar, affärer
              och samtalsstatistik. Det går inte att ångra.
            </p>
            <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>
              Leads som redan fanns i dialern när listan importerades ligger kvar, och
              detsamma gäller leads som även ligger i en annan mapp.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-md text-[13px] font-medium"
                style={{ background: "var(--surface-inset)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
              >
                Avbryt
              </button>
              <button
                onClick={confirmDeleteList}
                className="px-4 py-2 rounded-md text-[13px] font-medium"
                style={{ background: "var(--danger)", color: "white" }}
              >
                Ta bort mapp
              </button>
            </div>
          </div>
        </div>
      )}

      {shareList && (
        <ShareListModal
          listId={shareList.id}
          listName={shareList.name}
          users={users}
          currentMemberIds={shareList.members.map((m) => m.id)}
          onClose={() => setShareList(null)}
        />
      )}
    </div>
  );
}
