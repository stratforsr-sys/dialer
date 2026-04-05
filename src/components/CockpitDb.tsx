"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, Mail, ArrowLeft, SkipForward, Clock,
  Building2, Users, Zap, FlaskConical, X, AlertTriangle,
} from "lucide-react";
import { logCall } from "@/app/actions/activities";
import { startSession, endSession, logCallEvent } from "@/app/actions/sessions";
import { ResearchView } from "@/components/ResearchView";

// ─── Types ────────────────────────────────────────────────────────────────────
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

type Tab = "contact" | "website" | "linkedin" | "research";

// ─── Status buttons ───────────────────────────────────────────────────────────
const STATUS_BUTTONS = [
  { key: "1", label: "Svarar ej",      status: "svarar_ej",   color: "#6B7280", shortcut: "1" },
  { key: "2", label: "Upptagett",      status: "upptagett",   color: "#F59E0B", shortcut: "2" },
  { key: "3", label: "Återsamtal",     status: "atersam",     color: "#3B82F6", shortcut: "3" },
  { key: "4", label: "Ej intresserad", status: "nej_tack",    color: "#EF4444", shortcut: "4" },
  { key: "5", label: "Intresserad",    status: "intresserad", color: "#8B5CF6", shortcut: "5" },
  { key: "6", label: "Möte bokat",     status: "bokat_mote",  color: "#10B981", shortcut: "6" },
] as const;

// ─── Best-time indicator ──────────────────────────────────────────────────────
function getBestTime(role: string | undefined): { color: string; tip: string } {
  const h = new Date().getHours();
  const r = (role ?? "").toLowerCase();

  if (r.includes("vd") || r.includes("ceo") || r.includes("grundare") || r.includes("founder")) {
    if ((h >= 8 && h < 9) || (h >= 16 && h < 17)) return { color: "#22c55e", tip: "VD:ar nås bäst kl 08–09 & 16–17" };
    if (h >= 12 && h < 14) return { color: "#ef4444", tip: "Lunchtid — troligen otillgänglig" };
    return { color: "#f59e0b", tip: "Kan vara i möte" };
  }
  if (r.includes("sales") || r.includes("säljare") || r.includes("account")) {
    if (h >= 14 && h < 16) return { color: "#22c55e", tip: "Säljare nås bäst kl 14–16" };
    if (h >= 9 && h < 12)  return { color: "#ef4444", tip: "Ofta ute på kundmöten" };
    return { color: "#f59e0b", tip: "Kan vara på kundmöte" };
  }
  if (r.includes("cto") || r.includes("tech") || r.includes("utvecklare") || r.includes("developer")) {
    if ((h >= 8 && h < 10) || (h >= 16 && h < 17)) return { color: "#22c55e", tip: "Tekniker nås bäst innan/efter fokustid" };
    if (h >= 10 && h < 15) return { color: "#ef4444", tip: "Fokustid — stör ogärna" };
    return { color: "#f59e0b", tip: "Kan vara i kodfokus" };
  }
  if ((h >= 10 && h < 12) || (h >= 14 && h < 16)) return { color: "#22c55e", tip: "Generellt bra tid att ringa" };
  if (h >= 12 && h < 13)  return { color: "#ef4444", tip: "Lunchtid" };
  return { color: "#f59e0b", tip: "Okänd tid — pröva lyckan" };
}

function BestTimeIndicator({ role }: { role: string | null }) {
  const [show, setShow] = useState(false);
  const { color, tip } = getBestTime(role ?? undefined);
  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span
        className="w-[7px] h-[7px] rounded-full cursor-default"
        style={{ background: color, boxShadow: `0 0 0 2px ${color}30` }}
      />
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[11px] font-medium rounded-[6px] whitespace-nowrap z-20 pointer-events-none"
            style={{ background: "var(--text)", color: "var(--bg)", boxShadow: "var(--shadow-md)" }}
          >
            {tip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Iframe panel with X-Frame fallback ──────────────────────────────────────
function IframePanel({ src, label, fallbackHref }: { src: string; label: string; fallbackHref: string }) {
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Detect X-Frame-Options block via timing — frame stays empty after load
  const handleLoad = useCallback(() => {
    setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc.body.innerHTML === "") setFailed(true);
      } catch {
        setFailed(true);
      }
    }, 500);
  }, []);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "var(--surface-inset)" }}>
        <div
          className="w-12 h-12 rounded-[14px] flex items-center justify-center"
          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
        >
          <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>Kan inte bädda in sidan</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>Webbplatsen blockerar inbäddning (X-Frame-Options)</p>
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-[10px]"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            <ExternalLink size={13} />
            Öppna {label} i ny flik
          </a>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      className="w-full h-full border-0"
      title={label}
      onLoad={handleLoad}
      onError={() => setFailed(true)}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}

// ─── Format idle time ─────────────────────────────────────────────────────────
function formatIdle(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CockpitDb({ leads, userId }: { leads: Lead[]; userId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [contactIndex, setContactIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalCalls, setTotalCalls] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [totalIdleSeconds, setTotalIdleSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("contact");

  const activeLeads = leads.filter((l) => !skipped.has(l.id));
  const lead = activeLeads[index] ?? null;
  const contact = lead?.contacts[contactIndex] ?? null;

  // Session
  useEffect(() => {
    startSession().then((s) => setSessionId(s.id));
    return () => { if (sessionId) endSession(sessionId, totalCalls, totalIdleSeconds); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle timer
  useEffect(() => {
    const t = setInterval(() => setIdleSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Reset iframe state on lead/tab change
  useEffect(() => { /* iframe key handles reset */ }, [lead?.id, activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const btn = STATUS_BUTTONS.find((b) => b.shortcut === e.key);
      if (btn) handleStatus(btn.status, btn.label);
      if (e.key === "ArrowRight" || e.key === "n") nextLead();
      if (e.key === "ArrowLeft"  || e.key === "p") prevLead();
      if (e.key === "s") skipLead();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function handleStatus(status: string, label: string) {
    if (!lead || !sessionId) return;
    const idle = idleSeconds;
    setIdleSeconds(0);
    setTotalCalls((n) => n + 1);
    setTotalIdleSeconds((n) => n + idle);
    startTransition(async () => {
      await Promise.all([logCall(lead.id, contact?.id ?? null, status), logCallEvent(sessionId, idle)]);
    });
    setTimeout(() => nextLead(), 300);
  }

  function nextLead() { setIndex((i) => Math.min(i + 1, activeLeads.length - 1)); setContactIndex(0); setIdleSeconds(0); }
  function prevLead() { setIndex((i) => Math.max(i - 1, 0)); setContactIndex(0); }
  function skipLead() { if (lead) { setSkipped((s) => new Set(Array.from(s).concat(lead.id))); setContactIndex(0); } }

  // URLs
  const websiteUrl = lead?.website
    ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`)
    : null;
  const linkedinUrl = contact?.linkedin
    ? (contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`)
    : `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact?.name ?? ""} ${lead?.companyName ?? ""}`)}`;

  // ─── Empty state ─────────────────────────────────────────────────────────────
  if (activeLeads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          <Zap size={28} style={{ color: "var(--success)" }} />
        </div>
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>Listan är klar!</h2>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>{totalCalls} samtal gjorda denna session</p>
        <button onClick={() => router.push("/leads")} className="px-5 py-2 text-[13px] font-medium rounded-[10px] mt-2" style={{ background: "var(--accent)", color: "var(--bg)" }}>
          Tillbaka till leads
        </button>
      </div>
    );
  }

  if (!lead || !contact) return null;

  const progress = (index / Math.max(activeLeads.length - 1, 1)) * 100;
  const isExpanded = activeTab !== "contact";

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => router.push("/leads")}
          className="flex items-center gap-1 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} /> Avsluta
        </button>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="w-[160px] h-[3px] rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--accent)" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {index + 1} / {activeLeads.length}
          </span>
        </div>

        {/* Session stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <Phone size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{totalCalls}</span>
          </div>
          <div className="flex items-center gap-1 text-[12px]" style={{ color: idleSeconds > 120 ? "var(--warning)" : "var(--text-dim)" }}>
            <Clock size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{formatIdle(idleSeconds)}</span>
          </div>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Contact column (always visible, compact when expanded) ─────── */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{
            width: isExpanded ? "320px" : "100%",
            flexShrink: 0,
            borderRight: isExpanded ? "1px solid var(--border)" : "none",
            transition: "width 0.3s var(--ease-out-expo)",
          }}
        >
          <div className={`flex flex-col ${isExpanded ? "px-4 py-4" : "items-center justify-center px-4 py-0 flex-1"}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={lead.id + contactIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
                style={{ maxWidth: isExpanded ? "none" : "560px", margin: isExpanded ? "0" : "0 auto" }}
              >
                {/* Company header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[15px] font-bold shrink-0"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", fontFamily: "var(--font-serif)" }}
                  >
                    {lead.companyName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h1
                      className="leading-tight truncate"
                      style={{
                        fontSize: isExpanded ? "15px" : "20px",
                        fontWeight: isExpanded ? "600" : "400",
                        fontFamily: isExpanded ? "var(--font-sans)" : "var(--font-serif)",
                        color: "var(--text)",
                      }}
                    >
                      {lead.companyName}
                    </h1>
                    <div className="flex items-center gap-2 mt-[2px] flex-wrap">
                      <span
                        className="text-[10px] px-[6px] py-[1px] rounded-full font-medium"
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
                                color: i === contactIndex ? "var(--bg)" : "var(--text-dim)",
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

                {/* Tab bar */}
                <div className="flex items-center gap-1 mb-3 p-[3px] rounded-[10px]" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                  {[
                    { id: "contact" as Tab,  icon: <Phone size={12} />,        label: "Kontakt" },
                    { id: "website" as Tab,  icon: <Globe size={12} />,        label: "Hemsida" },
                    { id: "linkedin" as Tab, icon: <Linkedin size={12} />,     label: "LinkedIn" },
                    { id: "research" as Tab, icon: <FlaskConical size={12} />, label: "Research" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="flex-1 flex items-center justify-center gap-[5px] py-[5px] text-[11px] font-medium transition-all duration-150 rounded-[7px]"
                      style={{
                        background: activeTab === tab.id ? "var(--surface)" : "transparent",
                        color: activeTab === tab.id ? "var(--text)" : "var(--text-dim)",
                        boxShadow: activeTab === tab.id ? "var(--shadow-xs)" : "none",
                        border: activeTab === tab.id ? "1px solid var(--border)" : "1px solid transparent",
                      }}
                    >
                      {tab.icon}
                      {!isExpanded && tab.label}
                    </button>
                  ))}
                </div>

                {/* Contact card (only on contact tab) */}
                {activeTab === "contact" && (
                  <div
                    className="rounded-[18px] p-5 mb-4"
                    style={{ background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{contact.name}</p>
                        {contact.role && (
                          <div className="flex items-center gap-2 mt-[3px]">
                            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{contact.role}</p>
                            <BestTimeIndicator role={contact.role} />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`}
                            className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors"
                            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                            <Mail size={12} style={{ color: "var(--text-muted)" }} />
                          </a>
                        )}
                        {websiteUrl && (
                          <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                            className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors"
                            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                            <Globe size={12} style={{ color: "var(--text-muted)" }} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Phone numbers */}
                    <div className="flex flex-col gap-2">
                      {contact.directPhone && (
                        <a
                          href={`tel:${contact.directPhone}`}
                          className="flex items-center gap-3 px-4 py-3 rounded-[12px] transition-all"
                          style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
                            <Phone size={13} color="var(--bg)" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Direkttelefon</p>
                            <p className="text-[16px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>{contact.directPhone}</p>
                          </div>
                          <ExternalLink size={13} className="ml-auto" style={{ color: "var(--text-dim)" }} />
                        </a>
                      )}
                      {contact.switchboard && (
                        <a
                          href={`tel:${contact.switchboard}`}
                          className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                            <Building2 size={12} style={{ color: "var(--text-muted)" }} />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Växel</p>
                            <p className="text-[15px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>{contact.switchboard}</p>
                          </div>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Compact contact info for non-contact tabs */}
                {activeTab !== "contact" && (
                  <div
                    className="flex items-center gap-3 px-3 py-2 rounded-[10px] mb-3"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{contact.name}</span>
                      <span className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>{contact.role}</span>
                    </div>
                    {contact.directPhone && (
                      <a href={`tel:${contact.directPhone}`} className="text-[12px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {contact.directPhone}
                      </a>
                    )}
                  </div>
                )}

                {/* Status buttons (always visible) */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {STATUS_BUTTONS.map((btn) => (
                    <motion.button
                      key={btn.key}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleStatus(btn.status, btn.label)}
                      disabled={isPending}
                      className="flex items-center justify-between px-3 py-[9px] text-[12px] font-medium transition-all"
                      style={{
                        background: btn.color + "10",
                        border: `1px solid ${btn.color}28`,
                        color: btn.color,
                        borderRadius: "10px",
                      }}
                    >
                      <span>{btn.label}</span>
                      <span className="text-[10px] px-[5px] py-[1px] rounded font-bold" style={{ background: btn.color + "20" }}>{btn.shortcut}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={prevLead}
                    disabled={index === 0}
                    className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                    style={{ color: index === 0 ? "var(--text-dim)" : "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index === 0 ? 0.4 : 1 }}
                  >
                    <ChevronLeft size={13} /> Föregående
                  </button>
                  <button
                    onClick={skipLead}
                    className="flex items-center gap-1 text-[11px] px-3 py-2 rounded-[8px]"
                    style={{ color: "var(--text-dim)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    <SkipForward size={12} /> Skippa
                  </button>
                  <button
                    onClick={nextLead}
                    disabled={index >= activeLeads.length - 1}
                    className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index >= activeLeads.length - 1 ? 0.4 : 1 }}
                  >
                    Nästa <ChevronRight size={13} />
                  </button>
                </div>

                {!isExpanded && (
                  <p className="text-center text-[10px] mt-3" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    1–6 status · ← → navigera · S skippa
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right panel (website / linkedin / research) ─────────────────── */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col overflow-hidden"
              style={{ background: "var(--bg)" }}
            >
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-4 h-[44px] border-b shrink-0"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {activeTab === "website"  && <><Globe size={14} /> {websiteUrl ? new URL(websiteUrl).hostname : "Hemsida"}</>}
                  {activeTab === "linkedin" && <><Linkedin size={14} /> LinkedIn</>}
                  {activeTab === "research" && <><FlaskConical size={14} /> Research</>}
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === "website" && websiteUrl && (
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px]"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)" }}>
                      <ExternalLink size={11} /> Öppna
                    </a>
                  )}
                  {activeTab === "linkedin" && (
                    <a href={linkedinUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px]"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)" }}>
                      <ExternalLink size={11} /> Öppna
                    </a>
                  )}
                </div>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "website" && (
                  websiteUrl
                    ? <IframePanel key={`website-${lead.id}`} src={websiteUrl} label={new URL(websiteUrl).hostname} fallbackHref={websiteUrl} />
                    : (
                      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: "var(--surface-inset)" }}>
                        <Globe size={32} style={{ color: "var(--text-dim)" }} />
                        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Ingen hemsida angiven för detta lead</p>
                      </div>
                    )
                )}

                {activeTab === "linkedin" && (
                  <IframePanel
                    key={`linkedin-${contact.id}`}
                    src={linkedinUrl}
                    label="LinkedIn"
                    fallbackHref={linkedinUrl}
                  />
                )}

                {activeTab === "research" && (
                  <div className="h-full overflow-y-auto">
                    <ResearchView />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
