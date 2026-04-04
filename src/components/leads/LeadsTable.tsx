"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, ChevronRight, Building2, Phone, Users } from "lucide-react";
import type { LeadWithMeta } from "@/app/actions/leads";
import { CreateLeadModal } from "./CreateLeadModal";

type Stage = { id: string; name: string; color: string; _count: { leads: number } };

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just nu";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
}

const ACTIVITY_LABELS: Record<string, string> = {
  CALL: "Ringde",
  CALL_NO_ANSWER: "Inget svar",
  NOTE: "Anteckning",
  STAGE_CHANGE: "Steg ändrat",
  MEETING_BOOKED: "Möte bokat",
  MEETING_COMPLETED: "Show",
  MEETING_NO_SHOW: "No-show",
  LEAD_CREATED: "Lead skapad",
  LEAD_ASSIGNED: "Lead tilldelad",
  LEAD_IMPORTED: "Importerad",
  CONTACT_ADDED: "Kontakt tillagd",
  STATUS_CHANGE: "Status ändrad",
};

export function LeadsTable({
  leads,
  stages,
}: {
  leads: LeadWithMeta[];
  stages: Stage[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const currentSearch = searchParams.get("search") ?? "";
  const currentStage = searchParams.get("stageId") ?? "";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 h-[56px] border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <h1
            className="text-[15px] font-semibold"
            style={{ color: "var(--text)" }}
          >
            Leads
          </h1>
          <span
            className="text-[12px] px-2 py-[2px] rounded-full font-medium"
            style={{
              background: "var(--accent-muted)",
              color: "var(--accent)",
            }}
          >
            {leads.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 h-8"
            style={{
              background: "var(--surface-inset)",
              border: "1px solid var(--border-strong)",
              borderRadius: "8px",
              width: "220px",
            }}
          >
            <Search size={13} style={{ color: "var(--text-dim)" }} />
            <input
              ref={searchRef}
              defaultValue={currentSearch}
              placeholder="Sök bolag, orgnr..."
              className="flex-1 text-[13px] bg-transparent outline-none"
              style={{ color: "var(--text)" }}
              onChange={(e) => {
                const val = e.target.value;
                clearTimeout((searchRef.current as { _t?: ReturnType<typeof setTimeout> })?._t);
                (searchRef.current as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
                  () => updateFilter("search", val),
                  300
                );
              }}
            />
          </div>

          {/* Stage filter */}
          <select
            value={currentStage}
            onChange={(e) => updateFilter("stageId", e.target.value)}
            className="h-8 px-3 text-[13px] outline-none"
            style={{
              background: "var(--surface-inset)",
              border: "1px solid var(--border-strong)",
              borderRadius: "8px",
              color: currentStage ? "var(--text)" : "var(--text-muted)",
            }}
          >
            <option value="">Alla steg</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* New lead */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-[6px] h-8 px-3 text-[13px] font-medium transition-opacity"
            style={{
              background: "var(--accent)",
              color: "white",
              borderRadius: "8px",
              border: "none",
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Nytt lead
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {leads.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-64 gap-3"
            style={{ color: "var(--text-muted)" }}
          >
            <Building2 size={32} strokeWidth={1.5} />
            <p className="text-[14px]">Inga leads hittades</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                {["Bolag", "Steg", "Ägare", "Kontakter", "Senaste aktivitet"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-medium uppercase tracking-wide px-4 py-3 first:pl-6"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {h}
                    </th>
                  )
                )}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {leads.map((lead, i) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.02 }}
                    className="group cursor-pointer transition-colors duration-100"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--surface-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {/* Company */}
                    <td className="px-4 py-3 pl-6">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={{
                            background: "var(--surface-inset)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {lead.companyName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p
                            className="text-[13px] font-medium"
                            style={{ color: "var(--text)" }}
                          >
                            {lead.companyName}
                          </p>
                          {lead.orgNumber && (
                            <p
                              className="text-[11px]"
                              style={{ color: "var(--text-dim)" }}
                            >
                              {lead.orgNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px]"
                        style={{
                          borderRadius: "6px",
                          background: lead.stage.color + "18",
                          color: lead.stage.color,
                          border: `1px solid ${lead.stage.color}30`,
                        }}
                      >
                        <span
                          className="w-[5px] h-[5px] rounded-full"
                          style={{ background: lead.stage.color }}
                        />
                        {lead.stage.name}
                      </span>
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {lead.owner.name}
                      </span>
                    </td>

                    {/* Contacts */}
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1 text-[12px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Users size={12} />
                        {lead._count.contacts}
                      </div>
                    </td>

                    {/* Last activity */}
                    <td className="px-4 py-3">
                      {lead.activities[0] ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {ACTIVITY_LABELS[lead.activities[0].type] ?? lead.activities[0].type}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--text-dim)" }}
                          >
                            {formatRelativeTime(lead.activities[0].timestamp)}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          —
                        </span>
                      )}
                    </td>

                    {/* Arrow */}
                    <td className="pr-4">
                      <ChevronRight
                        size={14}
                        style={{ color: "var(--text-dim)" }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Create lead modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateLeadModal onClose={() => setShowCreateModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
