"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Play, Phone, ArrowUpDown, ExternalLink, MoreHorizontal, FolderInput, Filter } from "lucide-react";
import type { Contact, ContactStatus, CallList } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface ListViewProps {
  contacts: Contact[];
  callLists: CallList[];
  activeListId: string | null;
  onStartDialer: (startIndex?: number) => void;
  onOpenCockpit: (index: number) => void;
  onMoveContact: (contactId: string, toListId: string) => void;
}

type SortField = "name" | "company" | "status" | "lastContact";

export function ListView({ contacts, callLists, activeListId, onStartDialer, onOpenCockpit, onMoveContact }: ListViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alla" | ContactStatus>("alla");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const queue = contacts.filter(c => c.status === "ej_ringd").length;
  const otherLists = callLists.filter(l => l.id !== activeListId);

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
    let list = [...contacts];
    if (statusFilter !== "alla") list = list.filter(c => c.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.direct_phone?.includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sortField] || "";
      const bv = b[sortField] || "";
      const cmp = String(av).localeCompare(String(bv), "sv");
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [contacts, statusFilter, search, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const handleMoveContact = (contactId: string, toListId: string) => {
    onMoveContact(contactId, toListId);
    setMenuOpen(null);
  };

  const statusFilters: ("alla" | ContactStatus)[] = [
    "alla", "ej_ringd", "svarar_ej", "bokat_mote", "intresserad", "nej_tack", "upptaget", "atersam", "fel_nummer"
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-telink-bg">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="animate-fade-up">
            <h1 className="text-2xl font-bold text-telink-text tracking-tight mb-1">Kontakter</h1>
            <p className="text-sm text-telink-muted">
              <span className="text-telink-text-secondary font-medium">{filtered.length}</span> av {contacts.length} visas
            </p>
          </div>
          <button
            onClick={() => onStartDialer()}
            disabled={queue === 0}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-telink-accent via-pink-500 to-telink-violet text-telink-bg shadow-glow-sm hover:shadow-glow-md disabled:opacity-40 transition-all cursor-pointer animate-fade-up"
          >
            <Play size={14} fill="currentColor" /> Starta Dialer ({queue} kvar)
          </button>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-4 animate-fade-up" style={{ animationDelay: "50ms" }}>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-telink-dim" />
            <input
              type="text"
              placeholder="Sök kontakt, företag eller nummer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-telink-surface border border-telink-border text-sm text-telink-text placeholder-telink-dim focus:outline-none focus:border-telink-accent/50 focus:ring-2 focus:ring-telink-accent/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 text-telink-dim">
            <Filter size={14} />
            <span className="text-xs font-medium">Filter:</span>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 animate-fade-up" style={{ animationDelay: "100ms" }}>
          {statusFilters.map(s => {
            const active = statusFilter === s;
            const cfg = s !== "alla" ? STATUS_CONFIG[s] : null;
            const count = s === "alla" ? contacts.length : contacts.filter(c => c.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`
                  flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                  ${active
                    ? "bg-telink-accent-muted text-telink-accent border border-telink-accent/20"
                    : "text-telink-muted hover:bg-telink-surface-hover hover:text-telink-text border border-transparent"
                  }
                `}
              >
                {s === "alla" ? "Alla" : cfg?.label}
                <span className={`ml-0.5 font-mono text-[10px] tabular-nums ${active ? "text-telink-accent/70" : "text-telink-dim"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="rounded-2xl border border-telink-border overflow-hidden bg-telink-surface animate-fade-up" style={{ animationDelay: "150ms" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-telink-surface-elevated border-b border-telink-border">
                {[
                  { key: "name" as SortField, label: "Kontakt" },
                  { key: "company" as SortField, label: "Företag" },
                  { key: null, label: "Telefon" },
                  { key: "status" as SortField, label: "Status" },
                  { key: "lastContact" as SortField, label: "Senast" },
                  { key: null, label: "" },
                ].map((col, i) => (
                  <th
                    key={i}
                    className={`px-5 py-4 text-left text-xs font-semibold text-telink-muted whitespace-nowrap ${col.key ? "cursor-pointer hover:text-telink-text select-none transition-colors" : ""}`}
                    onClick={() => col.key && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.label}
                      {col.key && sortField === col.key && (
                        <ArrowUpDown size={11} className="text-telink-accent" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, idx) => {
                const cfg = STATUS_CONFIG[contact.status];
                const globalIndex = contacts.findIndex(c => c.id === contact.id);
                return (
                  <tr
                    key={contact.id}
                    className="border-b border-telink-border/50 hover:bg-telink-surface-hover/50 transition-colors cursor-pointer group"
                    onClick={() => onOpenCockpit(globalIndex)}
                    style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
                  >
                    {/* Name + role */}
                    <td className="px-5 py-4">
                      <div className="font-medium text-telink-text group-hover:text-telink-accent transition-colors">{contact.name || "—"}</div>
                      {contact.role && (
                        <div className="text-xs text-telink-dim mt-0.5">{contact.role}</div>
                      )}
                    </td>
                    {/* Company */}
                    <td className="px-5 py-4 text-telink-text-secondary">{contact.company || "—"}</td>
                    {/* Phone */}
                    <td className="px-5 py-4">
                      {contact.direct_phone ? (
                        <a
                          href={`tel:${contact.direct_phone}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-telink-accent font-mono text-xs hover:text-telink-accent-hover transition-colors"
                        >
                          <Phone size={11} /> {contact.direct_phone}
                        </a>
                      ) : (
                        <span className="text-telink-dim">—</span>
                      )}
                      {contact.switchboard && (
                        <div className="mt-0.5">
                          <a
                            href={`tel:${contact.switchboard}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-telink-dim font-mono hover:text-telink-muted transition-colors"
                          >
                            Växel: {contact.switchboard}
                          </a>
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}
                      >
                        <cfg.icon size={11} /> {cfg.label}
                      </span>
                    </td>
                    {/* Last contact */}
                    <td className="px-5 py-4 text-xs text-telink-dim font-mono tabular-nums">
                      {contact.lastContact
                        ? new Date(contact.lastContact).toLocaleDateString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"
                      }
                    </td>
                    {/* Action */}
                    <td className="px-5 py-4">
                      <div className="relative flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenCockpit(globalIndex); }}
                          className="p-1.5 rounded-lg hover:bg-telink-surface transition-colors text-telink-dim hover:text-telink-accent cursor-pointer"
                        >
                          <ExternalLink size={14} />
                        </button>

                        {otherLists.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(menuOpen === contact.id ? null : contact.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-telink-surface transition-colors text-telink-dim hover:text-telink-muted cursor-pointer"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        )}

                        {menuOpen === contact.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full mt-1 w-48 py-1.5 bg-telink-surface-elevated border border-telink-border rounded-xl shadow-elevation-3 z-50 animate-fade-down"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-3 py-1.5 text-2xs font-semibold text-telink-dim uppercase tracking-wider">
                              Flytta till
                            </div>
                            {otherLists.map(list => (
                              <button
                                key={list.id}
                                onClick={() => handleMoveContact(contact.id, list.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-telink-text hover:bg-telink-surface-hover transition-colors cursor-pointer"
                              >
                                <FolderInput size={13} className="text-telink-muted" />
                                <span className="truncate">{list.name}</span>
                                <span className="ml-auto text-xs text-telink-dim font-mono">{list.contacts.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="text-telink-dim text-sm">Inga kontakter matchar din sökning</div>
                    <button
                      onClick={() => { setSearch(""); setStatusFilter("alla"); }}
                      className="mt-3 text-xs text-telink-accent hover:text-telink-accent-hover transition-colors cursor-pointer"
                    >
                      Rensa filter
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
