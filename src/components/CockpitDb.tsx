"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, Mail, ArrowLeft, SkipForward, Clock,
  Building2, Zap, X, AlertTriangle, Copy, Check, TrendingUp,
} from "lucide-react";
import { logCall, createNote } from "@/app/actions/activities";
import { startSession, endSession, logCallEvent } from "@/app/actions/sessions";
import { CreateDealModal } from "@/components/deals/CreateDealModal";

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
  contacts: Contact[];
  activities: { timestamp: Date }[];
};

type Stage = { id: string; name: string; color: string };

type DrawerTab = "website" | "linkedin" | null;

const STATUS_BUTTONS = [
  { key: "1", label: "Svarar ej",      status: "svarar_ej",  color: "#6B7280", shortcut: "1" },
  { key: "2", label: "Upptagett",      status: "upptagett",  color: "#F59E0B", shortcut: "2" },
  { key: "3", label: "Återsamtal",     status: "atersam",    color: "#3B82F6", shortcut: "3" },
  { key: "4", label: "Ej intresserad", status: "nej_tack",   color: "#EF4444", shortcut: "4" },
  { key: "5", label: "Möte bokat",     status: "bokat_mote", color: "#10B981", shortcut: "5" },
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
    if (h >= 9 && h < 12) return { color: "#ef4444", tip: "Ofta ute på kundmöten" };
    return { color: "#f59e0b", tip: "Kan vara på kundmöte" };
  }
  if ((h >= 10 && h < 12) || (h >= 14 && h < 16)) return { color: "#22c55e", tip: "Generellt bra tid att ringa" };
  if (h >= 12 && h < 13) return { color: "#ef4444", tip: "Lunchtid" };
  return { color: "#f59e0b", tip: "Okänd tid" };
}

function BestTimeIndicator({ role }: { role: string | null }) {
  const [show, setShow] = useState(false);
  const { color, tip } = getBestTime(role ?? undefined);
  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="w-[7px] h-[7px] rounded-full cursor-default" style={{ background: color, boxShadow: `0 0 0 2px ${color}28` }} />
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
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

// ─── Iframe with X-Frame fallback ─────────────────────────────────────────────
function IframePanel({ src, label, fallbackHref }: { src: string; label: string; fallbackHref: string }) {
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleLoad = useCallback(() => {
    setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc || doc.body.innerHTML === "") setFailed(true);
      } catch { setFailed(true); }
    }, 600);
  }, []);
  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "var(--surface-inset)" }}>
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>Kan inte bädda in sidan</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>Webbplatsen blockerar inbäddning</p>
          <a href={fallbackHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-[10px]"
            style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <ExternalLink size={13} /> Öppna i ny flik
          </a>
        </div>
      </div>
    );
  }
  return (
    <iframe ref={iframeRef} src={src} className="w-full h-full border-0" title={label}
      onLoad={handleLoad} onError={() => setFailed(true)}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  );
}

function EmailRow({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.preventDefault();
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-[12px]"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
        <Mail size={12} style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>E-post</p>
        <p className="text-[13px] truncate" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{email}</p>
      </div>
      <button onClick={copy} title="Kopiera e-post"
        className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-all shrink-0"
        style={{ background: copied ? "var(--success-bg)" : "var(--surface)", border: `1px solid ${copied ? "var(--success-border)" : "var(--border-strong)"}` }}>
        {copied
          ? <Check size={12} style={{ color: "var(--success)" }} />
          : <Copy size={12} style={{ color: "var(--text-muted)" }} />}
      </button>
    </div>
  );
}

function formatIdle(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CockpitDb({ leads, userId, stages }: { leads: Lead[]; userId: string; stages: Stage[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [contactIndex, setContactIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalCalls, setTotalCalls] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [totalIdleSeconds, setTotalIdleSeconds] = useState(0);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(null);
  const [notes, setNotes] = useState("");
  const [showDealModal, setShowDealModal] = useState(false);

  const activeLeads = leads.filter((l) => !skipped.has(l.id));
  const lead = activeLeads[index] ?? null;
  const contact = lead?.contacts[contactIndex] ?? null;

  // Clear notes when lead changes
  const leadId = lead?.id;
  useEffect(() => { setNotes(""); }, [leadId]);

  // Always-fresh ref for handleStatus (avoids stale closure in keyboard handler)
  const handleStatusRef = useRef<(status: string, label: string) => void>(() => {});

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

  // Stable nav callbacks — FIX for stale closure navigation bug
  const nextLead = useCallback(() => {
    setIndex((i) => Math.min(i + 1, activeLeads.length - 1));
    setContactIndex(0);
    setIdleSeconds(0);
  }, [activeLeads.length]);

  const prevLead = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
    setContactIndex(0);
  }, []);

  const skipLead = useCallback(() => {
    setSkipped((s) => new Set(Array.from(s).concat(activeLeads[index]?.id ?? "")));
    setContactIndex(0);
  }, [activeLeads, index]);

  // Keyboard shortcuts — stable dep array, fresh handleStatus via ref
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const btn = STATUS_BUTTONS.find((b) => b.shortcut === e.key);
      if (btn) handleStatusRef.current(btn.status, btn.label);
      if (e.key === "ArrowRight" || e.key === "n") nextLead();
      if (e.key === "ArrowLeft"  || e.key === "p") prevLead();
      if (e.key === "s") skipLead();
      if (e.key === "Escape") setDrawerTab(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextLead, prevLead, skipLead]);

  function handleStatus(status: string, label: string) {
    if (!lead || !sessionId) return;
    const idle = idleSeconds;
    const noteText = notes.trim();
    setIdleSeconds(0);
    setTotalCalls((n) => n + 1);
    setTotalIdleSeconds((n) => n + idle);
    setNotes("");
    startTransition(async () => {
      await Promise.all([
        logCall(lead.id, contact?.id ?? null, status, noteText || undefined),
        logCallEvent(sessionId, idle),
      ]);
    });
    setTimeout(() => nextLead(), 300);
  }

  function handleSaveNote() {
    if (!lead || !notes.trim()) return;
    const text = notes.trim();
    setNotes("");
    startTransition(async () => {
      await createNote(lead.id, text, contact?.id ?? undefined);
    });
  }

  // Keep ref in sync every render
  handleStatusRef.current = handleStatus;

  const websiteUrl = lead?.website
    ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`)
    : null;
  const linkedinUrl = contact?.linkedin
    ? (contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`)
    : `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact?.name ?? ""} ${lead?.companyName ?? ""}`)}`;

  // Empty state
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

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b shrink-0" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <button onClick={() => router.push("/leads")} className="flex items-center gap-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={14} /> Avsluta
        </button>
        <div className="flex items-center gap-3">
          <div className="w-[160px] h-[3px] rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
            <motion.div className="h-full rounded-full" style={{ background: "var(--accent)" }}
              animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {index + 1} / {activeLeads.length}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <Phone size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{totalCalls}</span>
          </div>
          <div className="flex items-center gap-1 text-[12px]" style={{ color: idleSeconds > 120 ? "var(--warning)" : "var(--text-dim)" }}>
            <Clock size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{formatIdle(idleSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Main — always centered, never changes layout */}
      <div className="flex-1 flex items-center justify-center px-4 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={lead.id + contactIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="w-full max-w-[560px] py-6"
          >
            {/* Company header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[15px] font-bold shrink-0"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", fontFamily: "var(--font-serif)" }}>
                {lead.companyName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[20px] leading-tight truncate" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
                  {lead.companyName}
                </h1>
                {lead.contacts.length > 1 && (
                  <div className="flex items-center gap-1 mt-[3px]">
                    {lead.contacts.map((c, i) => (
                      <button key={c.id} onClick={() => setContactIndex(i)}
                        className="w-5 h-5 rounded-full text-[9px] font-bold transition-all"
                        style={{ background: i === contactIndex ? "var(--accent)" : "var(--surface-inset)", color: i === contactIndex ? "var(--bg)" : "var(--text-dim)", border: `1px solid ${i === contactIndex ? "var(--accent)" : "var(--border)"}` }}>
                        {c.name.charAt(0)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Skapa deal */}
              <button
                onClick={() => setShowDealModal(true)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-[9px] shrink-0 transition-all"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--bg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                title="Skapa deal för detta lead"
              >
                <TrendingUp size={11} />
                Deal
              </button>
            </div>

            {/* Contact card */}
            <div className="rounded-[18px] p-5 mb-4"
              style={{ background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
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
                {/* Quick-open buttons for drawer */}
                <div className="flex items-center gap-1">
                  {websiteUrl && (
                    <button onClick={() => setDrawerTab("website")}
                      className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors"
                      style={{ background: drawerTab === "website" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "website" ? "var(--border-strong)" : "var(--border)"}` }}
                      title="Öppna hemsida">
                      <Globe size={12} style={{ color: drawerTab === "website" ? "var(--accent)" : "var(--text-muted)" }} />
                    </button>
                  )}
                  <button onClick={() => setDrawerTab("linkedin")}
                    className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors"
                    style={{ background: drawerTab === "linkedin" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "linkedin" ? "var(--border-strong)" : "var(--border)"}` }}
                    title="Öppna LinkedIn">
                    <Linkedin size={12} style={{ color: drawerTab === "linkedin" ? "var(--accent)" : "var(--text-muted)" }} />
                  </button>
                </div>
              </div>

              {/* Phone numbers + email */}
              <div className="flex flex-col gap-2">
                {contact.directPhone && (
                  <a href={`tel:${contact.directPhone}`} className="flex items-center gap-3 px-4 py-3 rounded-[12px] transition-all"
                    style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}>
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
                  <a href={`tel:${contact.switchboard}`} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                      <Building2 size={12} style={{ color: "var(--text-muted)" }} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Växel</p>
                      <p className="text-[15px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>{contact.switchboard}</p>
                    </div>
                  </a>
                )}
                {contact.email && <EmailRow email={contact.email} />}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-3">
              <div className="relative">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSaveNote();
                    }
                  }}
                  placeholder="Anteckningar... (Cmd+Enter för att spara utan samtal)"
                  rows={2}
                  className="w-full resize-none text-[13px] px-4 py-3 rounded-[12px] outline-none transition-all"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                    fontFamily: "var(--font-sans)",
                    lineHeight: 1.5,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
                {notes.trim() && (
                  <button
                    onClick={handleSaveNote}
                    disabled={isPending}
                    className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-[7px] transition-all"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                    title="Spara anteckning (Cmd+Enter)"
                  >
                    Spara
                  </button>
                )}
              </div>
            </div>

            {/* Status buttons */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {STATUS_BUTTONS.map((btn) => (
                <motion.button key={btn.key} whileTap={{ scale: 0.96 }}
                  onClick={() => handleStatus(btn.status, btn.label)}
                  disabled={isPending}
                  className="flex items-center justify-between px-3 py-[9px] text-[12px] font-medium transition-all"
                  style={{ background: btn.color + "10", border: `1px solid ${btn.color}28`, color: btn.color, borderRadius: "10px" }}>
                  <span>{btn.label}</span>
                  <span className="text-[10px] px-[5px] py-[1px] rounded font-bold" style={{ background: btn.color + "20" }}>{btn.shortcut}</span>
                </motion.button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-2">
              <button onClick={prevLead} disabled={index === 0}
                className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                style={{ color: index === 0 ? "var(--text-dim)" : "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index === 0 ? 0.4 : 1 }}>
                <ChevronLeft size={13} /> Föregående
              </button>
              <button onClick={skipLead}
                className="flex items-center gap-1 text-[11px] px-3 py-2 rounded-[8px]"
                style={{ color: "var(--text-dim)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                <SkipForward size={12} /> Skippa (S)
              </button>
              <button onClick={nextLead} disabled={index >= activeLeads.length - 1}
                className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index >= activeLeads.length - 1 ? 0.4 : 1 }}>
                Nästa <ChevronRight size={13} />
              </button>
            </div>

            <p className="text-center text-[10px] mt-3" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              1–5 status · ← → navigera · S skippa · ESC stäng panel
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Right drawer (Hemsida / LinkedIn) ──────────────────────────────── */}
      <AnimatePresence>
        {drawerTab !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 cursor-pointer"
              style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(2px)", top: "52px" }}
              onClick={() => setDrawerTab(null)}
            />

            {/* Drawer panel */}
            <motion.div
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="fixed right-0 bottom-0 z-40 flex flex-col"
              style={{ top: "52px", width: "62%", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-xl)" }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-4 h-[44px] border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  {/* Tab switcher inside drawer */}
                  <div className="flex items-center gap-[2px] p-[2px] rounded-[8px]" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    {websiteUrl && (
                      <button onClick={() => setDrawerTab("website")}
                        className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-[6px] transition-all"
                        style={{ background: drawerTab === "website" ? "var(--surface)" : "transparent", color: drawerTab === "website" ? "var(--text)" : "var(--text-dim)", border: drawerTab === "website" ? "1px solid var(--border)" : "1px solid transparent" }}>
                        <Globe size={11} /> Hemsida
                      </button>
                    )}
                    <button onClick={() => setDrawerTab("linkedin")}
                      className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-[6px] transition-all"
                      style={{ background: drawerTab === "linkedin" ? "var(--surface)" : "transparent", color: drawerTab === "linkedin" ? "var(--text)" : "var(--text-dim)", border: drawerTab === "linkedin" ? "1px solid var(--border)" : "1px solid transparent" }}>
                      <Linkedin size={11} /> LinkedIn
                    </button>
                  </div>
                  {drawerTab === "website" && websiteUrl && (
                    <span className="text-[11px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {new URL(websiteUrl).hostname}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {drawerTab === "website" && websiteUrl && (
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px]"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <ExternalLink size={11} /> Öppna
                    </a>
                  )}
                  {drawerTab === "linkedin" && (
                    <a href={linkedinUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px]"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <ExternalLink size={11} /> Öppna
                    </a>
                  )}
                  <button onClick={() => setDrawerTab(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-colors"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Drawer content */}
              <div className="flex-1 overflow-hidden">
                {drawerTab === "website" && (
                  websiteUrl
                    ? <IframePanel key={`website-${lead.id}`} src={websiteUrl} label={new URL(websiteUrl).hostname} fallbackHref={websiteUrl} />
                    : (
                      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: "var(--surface-inset)" }}>
                        <Globe size={32} style={{ color: "var(--text-dim)" }} />
                        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Ingen hemsida angiven</p>
                      </div>
                    )
                )}
                {drawerTab === "linkedin" && (
                  <IframePanel key={`linkedin-${contact.id}`} src={linkedinUrl} label="LinkedIn" fallbackHref={linkedinUrl} />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* CreateDeal modal */}
      {showDealModal && lead && (
        <CreateDealModal
          leadId={lead.id}
          companyName={lead.companyName}
          stages={stages}
          defaultStageId={stages.find((s) => s.name.toLowerCase().includes("möte"))?.id ?? stages[0]?.id ?? ""}
          onClose={() => setShowDealModal(false)}
          onCreated={() => { setShowDealModal(false); nextLead(); }}
        />
      )}
    </div>
  );
}
