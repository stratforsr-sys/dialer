"use client";

import { useState, useMemo } from "react";
import { Search, Building2, ChevronRight } from "lucide-react";
import { ResearchPanel } from "./ResearchPanel";
import type { Contact } from "@/types";

type Lead = {
  id: string;
  companyName: string;
  orgNumber: string | null;
  website: string | null;
  contacts: { name: string; role: string | null; directPhone: string | null; email: string | null }[];
};

function adaptLeadToContact(lead: Lead): Contact {
  const c = lead.contacts[0];
  return {
    id: lead.id,
    name: c?.name ?? "",
    company: lead.companyName,
    role: c?.role ?? "",
    direct_phone: c?.directPhone ?? "",
    switchboard: "",
    email: c?.email ?? "",
    website: lead.website ?? "",
    linkedin: "",
    org_number: lead.orgNumber ?? "",
    status: "ej_ringd",
    notes: "",
    tags: [],
    lastContact: null,
  };
}

export function ResearchPageClient({ leads }: { leads: Lead[] }) {
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [customCompany, setCustomCompany] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.companyName.toLowerCase().includes(q) ||
        (l.orgNumber ?? "").includes(q)
    );
  }, [leads, search]);

  const activeContact = useMemo<Contact | null>(() => {
    if (showCustom && customCompany.trim()) {
      return {
        id: `custom-${customCompany}`,
        name: "",
        company: customCompany.trim(),
        role: "",
        direct_phone: "",
        switchboard: "",
        email: "",
        website: "",
        linkedin: "",
        org_number: "",
        status: "ej_ringd",
        notes: "",
        tags: [],
        lastContact: null,
      };
    }
    if (selectedLead) return adaptLeadToContact(selectedLead);
    return null;
  }, [selectedLead, showCustom, customCompany]);

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Left: search + lead list */}
      <div
        className="w-[280px] shrink-0 flex flex-col border-r h-full"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h1 className="text-[14px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            Research
          </h1>
          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)" }}
          >
            <Search size={13} style={{ color: "var(--text-dim)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök bolag eller org.nr..."
              className="flex-1 text-[12px] outline-none bg-transparent"
              style={{ color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Custom company option */}
        <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => {
              setShowCustom(true);
              setSelectedLead(null);
            }}
            className="w-full text-left text-[11px] font-medium"
            style={{ color: "var(--accent)" }}
          >
            + Research valfritt bolag
          </button>
          {showCustom && (
            <input
              autoFocus
              value={customCompany}
              onChange={(e) => setCustomCompany(e.target.value)}
              placeholder="Bolagsnamn..."
              className="mt-2 w-full text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
              style={{
                background: "var(--surface-inset)",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
              }}
            />
          )}
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-[12px] px-4 py-6" style={{ color: "var(--text-dim)" }}>
              Inga leads hittades
            </p>
          ) : (
            filtered.map((lead) => {
              const active = selectedLead?.id === lead.id && !showCustom;
              return (
                <button
                  key={lead.id}
                  onClick={() => {
                    setSelectedLead(lead);
                    setShowCustom(false);
                  }}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{
                      background: active ? "rgba(255,255,255,0.2)" : "var(--surface-inset)",
                      color: active ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {lead.companyName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[12px] font-medium truncate"
                      style={{ color: active ? "white" : "var(--text)" }}
                    >
                      {lead.companyName}
                    </p>
                    {lead.orgNumber && (
                      <p
                        className="text-[10px] truncate"
                        style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--text-dim)" }}
                      >
                        {lead.orgNumber}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    size={12}
                    style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--text-dim)" }}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Research panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeContact ? (
          <ResearchPanel
            key={activeContact.id}
            contact={activeContact}
            className="flex-1"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center"
              style={{ background: "var(--surface-inset)" }}
            >
              <Building2 size={24} style={{ color: "var(--text-dim)" }} />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>
                Välj ett bolag
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Välj ett lead från listan eller sök på valfritt bolag
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
