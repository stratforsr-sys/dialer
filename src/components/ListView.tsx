"use client";

import { useState, useMemo } from "react";
import { Search, Filter, Play, Phone, ChevronDown, ArrowUpDown, ExternalLink } from "lucide-react";
import type { Contact, ContactStatus } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface ListViewProps {
  contacts: Contact[];
  onStartDialer: (startIndex?: number) => void;
  onOpenCockpit: (index: number) => void;
}

type SortField = "name" | "company" | "status" | "lastContact";

export function ListView({ contacts, onStartDialer, onOpenCockpit }: ListViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alla" | ContactStatus>("alla");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const queue = contacts.filter(c => c.status === "ej_ringd").length;

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

  const statusFilters: ("alla" | ContactStatus)[] = [
    "alla", "ej_ringd", "svarar_ej", "bokat_mote", "intresserad", "nej_tack", "upptaget", "atersam", "fel_nummer"
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-telink-text tracking-tight">Kontakter</h1>
            <p className="text-sm text-telink-muted">{filtered.length} av {contacts.length} visas</p>
          </div>
          <button
            onClick={() => onStartDialer()}
            disabled={queue === 0}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#2bb574] text-white hover:shadow-[0_0_30px_rgba(43,181,116,0.35)] disabled:opacity-40 transition-all cursor-pointer"
          >
            <Play size={14} fill="currentColor" /> Starta Dialer ({queue} kvar)
          </button>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-telink-dim" />
            <input
              type="text"
              placeholder="Sök kontakt, företag eller nummer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-telink-surface border border-telink-border text-sm text-telink-text placeholder-telink-dim focus:outline-none focus:border-[#2bb574]/50 transition-colors"
            />
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1">
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
                    ? "bg-[rgba(43,181,116,0.12)] text-[#2bb574] border border-[rgba(43,181,116,0.2)]"
                    : "text-telink-muted hover:bg-telink-surface-hover hover:text-telink-text border border-transparent"
                  }
                `}
              >
                {s === "alla" ? "Alla" : cfg?.label}
                <span className={`ml-0.5 font-mono text-[10px] ${active ? "text-[#2bb574]/70" : "text-telink-dim"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="rounded-xl border border-telink-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-telink-surface border-b border-telink-border">
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
                    className={`px-4 py-3 text-left text-xs font-semibold text-telink-muted whitespace-nowrap ${col.key ? "cursor-pointer hover:text-telink-text select-none" : ""}`}
                    onClick={() => col.key && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.key && sortField === col.key && (
                        <ArrowUpDown size={11} className="text-[#2bb574]" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => {
                const cfg = STATUS_CONFIG[contact.status];
                const globalIndex = contacts.findIndex(c => c.id === contact.id);
                return (
                  <tr
                    key={contact.id}
                    className="border-b border-telink-border/40 hover:bg-telink-surface/60 transition-colors cursor-pointer"
                    onClick={() => onOpenCockpit(globalIndex)}
                  >
                    {/* Name + role */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-telink-text">{contact.name || "—"}</div>
                      {contact.role && (
                        <div className="text-xs text-telink-dim mt-0.5">{contact.role}</div>
                      )}
                    </td>
                    {/* Company */}
                    <td className="px-4 py-3 text-telink-muted">{contact.company || "—"}</td>
                    {/* Phone */}
                    <td className="px-4 py-3">
                      {contact.direct_phone ? (
                        <a
                          href={`tel:${contact.direct_phone}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-[#2bb574] font-mono text-xs hover:underline"
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
                            className="text-xs text-telink-dim font-mono hover:text-telink-muted"
                          >
                            Växel: {contact.switchboard}
                          </a>
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}
                      >
                        <cfg.icon size={11} /> {cfg.label}
                      </span>
                    </td>
                    {/* Last contact */}
                    <td className="px-4 py-3 text-xs text-telink-dim">
                      {contact.lastContact
                        ? new Date(contact.lastContact).toLocaleDateString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"
                      }
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenCockpit(globalIndex); }}
                        className="p-1.5 rounded-lg hover:bg-telink-surface-light transition-colors text-telink-dim hover:text-[#2bb574]"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-telink-dim text-sm">
                    Inga kontakter matchar din sökning
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
