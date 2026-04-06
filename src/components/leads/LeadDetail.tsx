"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Globe, Phone, Mail, Linkedin,
  Plus, Send, Edit2, Trash2, Building2, Users,
} from "lucide-react";
import type { LeadDetail as LeadDetailType } from "@/app/actions/leads";
import { updateLead, reassignLead } from "@/app/actions/leads";
import { createNote } from "@/app/actions/activities";
import { createContact } from "@/app/actions/contacts";

type Stage = { id: string; name: string; color: string };

const ACTIVITY_ICONS: Record<string, string> = {
  CALL: "📞",
  CALL_NO_ANSWER: "📵",
  NOTE: "📝",
  STAGE_CHANGE: "🔄",
  MEETING_BOOKED: "📅",
  MEETING_COMPLETED: "✅",
  MEETING_NO_SHOW: "❌",
  LEAD_CREATED: "🌱",
  LEAD_ASSIGNED: "👤",
  LEAD_IMPORTED: "📥",
  CONTACT_ADDED: "👥",
  STATUS_CHANGE: "🔁",
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadDetail({
  lead,
}: {
  lead: NonNullable<LeadDetailType>;
}) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", role: "", directPhone: "", email: "" });

  function handleNoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    const text = note;
    setNote("");
    startTransition(() => createNote(lead.id, text));
  }

  function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContact.name.trim()) return;
    const data = { ...newContact };
    setNewContact({ name: "", role: "", directPhone: "", email: "" });
    setShowAddContact(false);
    startTransition(() => { createContact(lead.id, data); });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-6 h-[56px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <Link
          href="/leads"
          className="flex items-center gap-1 text-[13px] transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} />
          Leads
        </Link>
        <span style={{ color: "var(--border-strong)" }}>/</span>
        <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
          {lead.companyName}
        </span>

        <div className="ml-auto" />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: details */}
        <div
          className="w-[340px] shrink-0 border-r overflow-y-auto"
          style={{ borderColor: "var(--border)" }}
        >
          {/* Company info */}
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[16px] font-bold"
                style={{ background: "var(--surface-inset)", color: "var(--text-secondary)" }}
              >
                {lead.companyName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  {lead.companyName}
                </h2>
                {lead.orgNumber && (
                  <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>
                    {lead.orgNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-[6px]">
              {lead.website && (
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[12px] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Globe size={12} />
                  {lead.website}
                </a>
              )}
              {lead.address && (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {lead.address}
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>Ägare:</span>
              <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                {lead.owner.name}
              </span>
            </div>
          </div>

          {/* Contacts */}
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Kontakter ({lead.contacts.length})
              </h3>
              <button
                onClick={() => setShowAddContact(!showAddContact)}
                className="flex items-center gap-1 text-[11px] font-medium"
                style={{ color: "var(--accent)" }}
              >
                <Plus size={11} /> Lägg till
              </button>
            </div>

            <AnimatePresence>
              {showAddContact && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleAddContact}
                  className="mb-3 overflow-hidden"
                >
                  <div
                    className="p-3 rounded-[10px] flex flex-col gap-2"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    {[
                      { field: "name", placeholder: "Namn *" },
                      { field: "role", placeholder: "Roll" },
                      { field: "directPhone", placeholder: "Telefon" },
                      { field: "email", placeholder: "Email" },
                    ].map(({ field, placeholder }) => (
                      <input
                        key={field}
                        value={newContact[field as keyof typeof newContact]}
                        onChange={(e) => setNewContact((c) => ({ ...c, [field]: e.target.value }))}
                        placeholder={placeholder}
                        required={field === "name"}
                        className="text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
                        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      />
                    ))}
                    <button
                      type="submit"
                      className="text-[12px] font-medium py-[6px] rounded-[6px]"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      Lägg till kontakt
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-2">
              {lead.contacts.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>Inga kontakter än</p>
              ) : (
                lead.contacts.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-[10px]"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{c.name}</p>
                      {c.role && (
                        <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>
                          {c.role}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-[4px]">
                      {c.directPhone && (
                        <a href={`tel:${c.directPhone}`} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                          <Phone size={11} /> {c.directPhone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                          <Mail size={11} /> {c.email}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Deals */}
          <div className="p-5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
              Deals ({lead.deals.length})
            </h3>
            {lead.deals.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>Inga deals än</p>
            ) : (
              <div className="flex flex-col gap-2">
                {lead.deals.map((d) => (
                  <div key={d.id} className="p-3 rounded-[10px] flex items-center justify-between"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{d.title}</p>
                      {(d.oneTimeValue || d.arrValue) && (
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {(d.oneTimeValue ?? d.arrValue ?? 0).toLocaleString("sv-SE")} kr
                          {d.valueType === "ARR" ? " /år" : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[11px] px-2 py-[3px] rounded-full font-medium"
                      style={{
                        background: d.status === "WON" ? "var(--success-bg)" : d.status === "LOST" ? "var(--danger-bg)" : "var(--info-bg)",
                        color: d.status === "WON" ? "var(--success)" : d.status === "LOST" ? "var(--danger)" : "var(--info)",
                      }}
                    >
                      {d.status === "WON" ? "Vunnen" : d.status === "LOST" ? "Förlorad" : "Öppen"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: activity feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Note input */}
          <div className="p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
            <form onSubmit={handleNoteSubmit} className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Skriv en anteckning..."
                className="flex-1 text-[13px] outline-none px-3 py-2 rounded-[8px]"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                }}
              />
              <button
                type="submit"
                disabled={!note.trim() || isPending}
                className="flex items-center gap-1 px-3 py-2 text-[13px] font-medium rounded-[8px] transition-opacity"
                style={{
                  background: "var(--accent)",
                  color: "white",
                  opacity: !note.trim() ? 0.5 : 1,
                }}
              >
                <Send size={13} />
                Spara
              </button>
            </form>
          </div>

          {/* Activity timeline */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-dim)" }}>
              Aktivitetslogg
            </p>

            {lead.activities.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>Inga aktiviteter än</p>
            ) : (
              <div className="flex flex-col gap-[1px]">
                {lead.activities.map((a, i) => {
                  const meta = a.metadata ? JSON.parse(a.metadata) : {};
                  return (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: i * 0.02 }}
                      className="flex gap-3 py-3"
                      style={{ borderBottom: i < lead.activities.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] shrink-0 mt-[1px]"
                        style={{ background: "var(--surface-inset)" }}
                      >
                        {ACTIVITY_ICONS[a.type] ?? "•"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-[2px]">
                          <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
                            {a.actor.name}
                          </span>
                          {a.contact && (
                            <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                              → {a.contact.name}
                            </span>
                          )}
                          <span className="text-[11px] ml-auto" style={{ color: "var(--text-dim)" }}>
                            {formatDate(a.timestamp)}
                          </span>
                        </div>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {a.type === "NOTE" && meta.note}
                          {a.type === "STAGE_CHANGE" && `${meta.from} → ${meta.to}`}
                          {a.type === "LEAD_ASSIGNED" && `${meta.from} → ${meta.to}`}
                          {a.type === "CALL" && `Status: ${meta.status}${meta.notes ? ` — ${meta.notes}` : ""}`}
                          {a.type === "CALL_NO_ANSWER" && "Inget svar"}
                          {a.type === "LEAD_CREATED" && "Lead skapades"}
                          {a.type === "LEAD_IMPORTED" && "Importerad via CSV"}
                          {a.type === "CONTACT_ADDED" && `${meta.name}${meta.role ? ` (${meta.role})` : ""} lades till`}
                          {a.type === "MEETING_BOOKED" && "Möte bokat"}
                          {a.type === "MEETING_COMPLETED" && "Show ✓"}
                          {a.type === "MEETING_NO_SHOW" && "No-show"}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
