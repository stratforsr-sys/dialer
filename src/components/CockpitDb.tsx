"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, Mail, ArrowLeft, SkipForward, Clock,
  Building2, Users, Zap,
} from "lucide-react";
import { logCall } from "@/app/actions/activities";
import { startSession, endSession, logCallEvent } from "@/app/actions/sessions";

type Contact = {
  id: string;
  name: string;
  role: string | null;
  directPhone: string | null;
  switchboard: string | null;
  email: string | null;
  linkedin: string | null;
};

type Lead = {
  id: string;
  companyName: string;
  website: string | null;
  stage: { id: string; name: string; color: string };
  contacts: Contact[];
  activities: { timestamp: Date }[];
};

const STATUS_BUTTONS = [
  { key: "1", label: "Svarar ej",   status: "svarar_ej",   color: "#6B7280", shortcut: "1" },
  { key: "2", label: "Upptagett",   status: "upptagett",    color: "#F59E0B", shortcut: "2" },
  { key: "3", label: "Återsamtal",  status: "atersam",      color: "#3B82F6", shortcut: "3" },
  { key: "4", label: "Ej intresserad", status: "nej_tack", color: "#EF4444", shortcut: "4" },
  { key: "5", label: "Intresserad", status: "intresserad",  color: "#8B5CF6", shortcut: "5" },
  { key: "6", label: "Möte bokat",  status: "bokat_mote",   color: "#10B981", shortcut: "6" },
] as const;

function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function CockpitDb({
  leads,
  userId,
}: {
  leads: Lead[];
  userId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [contactIndex, setContactIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalCalls, setTotalCalls] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [totalIdleSeconds, setTotalIdleSeconds] = useState(0);
  const [lastCallTime, setLastCallTime] = useState<number | null>(null);
  const idleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filtered leads (skip completed)
  const activeLeads = leads.filter((l) => !skipped.has(l.id));
  const lead = activeLeads[index] ?? null;
  const contact = lead?.contacts[contactIndex] ?? null;

  // Start session on mount
  useEffect(() => {
    startSession().then((s) => setSessionId(s.id));
    return () => {
      // End session on unmount
      if (sessionId) {
        endSession(sessionId, totalCalls, totalIdleSeconds);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle timer
  useEffect(() => {
    idleRef.current = setInterval(() => {
      setIdleSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (idleRef.current) clearInterval(idleRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const btn = STATUS_BUTTONS.find((b) => b.shortcut === e.key);
      if (btn) handleStatus(btn.status, btn.label);
      if (e.key === "ArrowRight" || e.key === "n") nextLead();
      if (e.key === "ArrowLeft" || e.key === "p") prevLead();
      if (e.key === "s") skipLead();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function handleStatus(status: string, label: string) {
    if (!lead || !sessionId) return;

    const idle = idleSeconds;
    setIdleSeconds(0);
    setLastCallTime(Date.now());
    setTotalCalls((n) => n + 1);
    setTotalIdleSeconds((n) => n + idle);

    startTransition(async () => {
      await Promise.all([
        logCall(lead.id, contact?.id ?? null, status),
        logCallEvent(sessionId, idle),
      ]);
    });

    // Advance to next lead after status
    setTimeout(() => nextLead(), 300);
  }

  function nextLead() {
    setIndex((i) => Math.min(i + 1, activeLeads.length - 1));
    setContactIndex(0);
    setIdleSeconds(0);
  }

  function prevLead() {
    setIndex((i) => Math.max(i - 1, 0));
    setContactIndex(0);
  }

  function skipLead() {
    if (!lead) return;
    setSkipped((s) => new Set(Array.from(s).concat(lead.id)));
    setContactIndex(0);
  }

  if (activeLeads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--success-bg)" }}>
          <Zap size={28} style={{ color: "var(--success)" }} />
        </div>
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>Listan är klar!</h2>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          {totalCalls} samtal gjorda denna session
        </p>
        <button onClick={() => router.push("/leads")} className="px-5 py-2 text-[13px] font-medium rounded-[10px] mt-2" style={{ background: "var(--accent)", color: "white" }}>
          Tillbaka till leads
        </button>
      </div>
    );
  }

  if (!lead || !contact) return null;

  const progress = ((index) / Math.max(activeLeads.length - 1, 1)) * 100;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg)" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => router.push("/leads")}
          className="flex items-center gap-1 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} /> Avsluta
        </button>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div
            className="w-[180px] h-[4px] rounded-full overflow-hidden"
            style={{ background: "var(--surface-inset)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--accent)" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {index + 1} / {activeLeads.length}
          </span>
        </div>

        {/* Session stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <Phone size={12} /> {totalCalls}
          </div>
          <div
            className="flex items-center gap-1 text-[12px]"
            style={{ color: idleSeconds > 120 ? "var(--warning)" : "var(--text-dim)" }}
          >
            <Clock size={12} /> {formatIdle(idleSeconds)}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={lead.id + contactIndex}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[560px]"
          >
            {/* Company header */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)" }}
              >
                {lead.companyName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-[20px] font-bold leading-tight" style={{ color: "var(--text)" }}>
                  {lead.companyName}
                </h1>
                <div className="flex items-center gap-2 mt-[2px]">
                  <span
                    className="text-[11px] px-2 py-[2px] rounded-full font-medium"
                    style={{ background: lead.stage.color + "18", color: lead.stage.color, border: `1px solid ${lead.stage.color}30` }}
                  >
                    {lead.stage.name}
                  </span>
                  {lead.contacts.length > 1 && (
                    <div className="flex items-center gap-1">
                      {lead.contacts.map((c, i) => (
                        <button
                          key={c.id}
                          onClick={() => setContactIndex(i)}
                          className="w-5 h-5 rounded-full text-[9px] font-bold transition-all"
                          style={{
                            background: i === contactIndex ? "var(--accent)" : "var(--surface-inset)",
                            color: i === contactIndex ? "white" : "var(--text-dim)",
                            border: `1px solid ${i === contactIndex ? "var(--accent)" : "var(--border)"}`,
                          }}
                        >
                          {c.name.charAt(0)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Contact card */}
            <div
              className="rounded-[18px] p-5 mb-5"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{contact.name}</p>
                  {contact.role && (
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{contact.role}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {contact.linkedin && (
                    <a href={contact.linkedin} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 flex items-center justify-center rounded-[8px] transition-colors"
                      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <Linkedin size={14} style={{ color: "var(--text-muted)" }} />
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`}
                      className="w-8 h-8 flex items-center justify-center rounded-[8px] transition-colors"
                      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <Mail size={14} style={{ color: "var(--text-muted)" }} />
                    </a>
                  )}
                  {lead.website && (
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 flex items-center justify-center rounded-[8px] transition-colors"
                      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <Globe size={14} style={{ color: "var(--text-muted)" }} />
                    </a>
                  )}
                </div>
              </div>

              {/* Phone numbers */}
              <div className="flex flex-col gap-2">
                {contact.directPhone && (
                  <a
                    href={`tel:${contact.directPhone}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-[12px] transition-colors group"
                    style={{ background: "var(--accent-muted)", border: "1px solid var(--accent)30" }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
                      <Phone size={14} color="white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--accent)" }}>Direkttelefon</p>
                      <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>{contact.directPhone}</p>
                    </div>
                    <ExternalLink size={14} className="ml-auto opacity-50" style={{ color: "var(--accent)" }} />
                  </a>
                )}
                {contact.switchboard && (
                  <a
                    href={`tel:${contact.switchboard}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                      <Building2 size={13} style={{ color: "var(--text-muted)" }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Växel</p>
                      <p className="text-[15px] font-medium tabular-nums" style={{ color: "var(--text)" }}>{contact.switchboard}</p>
                    </div>
                  </a>
                )}
              </div>
            </div>

            {/* Status buttons */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {STATUS_BUTTONS.map((btn) => (
                <motion.button
                  key={btn.key}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleStatus(btn.status, btn.label)}
                  disabled={isPending}
                  className="flex items-center justify-between px-3 py-[10px] rounded-[10px] text-[13px] font-medium transition-all"
                  style={{
                    background: btn.color + "12",
                    border: `1px solid ${btn.color}30`,
                    color: btn.color,
                  }}
                >
                  <span>{btn.label}</span>
                  <span
                    className="text-[11px] px-[6px] py-[1px] rounded font-bold"
                    style={{ background: btn.color + "20" }}
                  >
                    {btn.shortcut}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={prevLead}
                disabled={index === 0}
                className="flex items-center gap-1 text-[13px] px-3 py-2 rounded-[8px] transition-colors"
                style={{
                  color: index === 0 ? "var(--text-dim)" : "var(--text-muted)",
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border)",
                  opacity: index === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} /> Föregående
              </button>

              <button
                onClick={skipLead}
                className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                style={{ color: "var(--text-dim)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}
              >
                <SkipForward size={13} /> Skippa (S)
              </button>

              <button
                onClick={nextLead}
                disabled={index >= activeLeads.length - 1}
                className="flex items-center gap-1 text-[13px] px-3 py-2 rounded-[8px] transition-colors"
                style={{
                  color: "var(--text-muted)",
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border)",
                  opacity: index >= activeLeads.length - 1 ? 0.4 : 1,
                }}
              >
                Nästa <ChevronRight size={14} />
              </button>
            </div>

            {/* Keyboard hint */}
            <p className="text-center text-[11px] mt-4" style={{ color: "var(--text-dim)" }}>
              1–6 för status · ← → för navigation · S för skippa
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
