"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Phone, PhoneCall, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, MessageSquare, Keyboard, Building2, Mail, Hash,
  ArrowLeft, Search, Copy, Check, Zap, Clock, Flame
} from "lucide-react";
import type { Contact, ContactStatus } from "@/types";
import { STATUS_CONFIG, SHORTCUTS } from "@/lib/constants";

// Best-Time Indicator logic based on role
function getBestTimeIndicator(role: string | undefined): { status: "good" | "ok" | "bad"; label: string; tip: string } {
  const now = new Date();
  const hour = now.getHours();
  const roleLower = (role || "").toLowerCase();

  // VD/CEO: Early morning or late afternoon
  if (roleLower.includes("vd") || roleLower.includes("ceo") || roleLower.includes("grundare") || roleLower.includes("founder")) {
    if ((hour >= 8 && hour < 9) || (hour >= 16 && hour < 17)) {
      return { status: "good", label: "Bra tid", tip: "VD:ar nås bäst tidigt eller sent" };
    } else if (hour >= 12 && hour < 14) {
      return { status: "bad", label: "Upptagen", tip: "Lunchtid - ofta möten" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara i möte" };
  }

  // Sales: Avoid mornings
  if (roleLower.includes("sales") || roleLower.includes("säljare") || roleLower.includes("account")) {
    if (hour >= 14 && hour < 16) {
      return { status: "good", label: "Bra tid", tip: "Säljare ofta vid datorn nu" };
    } else if (hour >= 9 && hour < 12) {
      return { status: "bad", label: "Ute säljande", tip: "Ofta på kundmöten" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara upptagen" };
  }

  // CTO/Tech: Mornings or late afternoon
  if (roleLower.includes("cto") || roleLower.includes("tech") || roleLower.includes("utvecklare") || roleLower.includes("developer")) {
    if ((hour >= 8 && hour < 10) || (hour >= 16 && hour < 17)) {
      return { status: "good", label: "Bra tid", tip: "Innan/efter fokustid" };
    } else if (hour >= 10 && hour < 15) {
      return { status: "bad", label: "Fokustid", tip: "Tekniker stör ej ogärna" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara i kodfokus" };
  }

  // Default: Mid-morning or early afternoon
  if ((hour >= 10 && hour < 12) || (hour >= 14 && hour < 16)) {
    return { status: "good", label: "Bra tid", tip: "Generellt bra tidpunkt" };
  } else if (hour >= 12 && hour < 13) {
    return { status: "bad", label: "Lunchtid", tip: "Ofta upptagen med lunch" };
  }
  return { status: "ok", label: "Okänd", tip: "Pröva lyckan!" };
}

interface CockpitViewProps {
  contacts: Contact[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  setStatus: (id: string, status: ContactStatus) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  onExit: () => void;
  sessionCalls: number;
}

export function CockpitView({
  contacts, currentIndex, setCurrentIndex, setStatus, updateContact, onExit, sessionCalls
}: CockpitViewProps) {
  const [researchTab, setResearchTab] = useState<"website" | "linkedin">("website");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const contact = contacts[currentIndex];
  const total = contacts.length;
  const worked = contacts.filter(c => c.status !== "ej_ringd").length;
  const pctDone = total > 0 ? Math.round((worked / total) * 100) : 0;

  // Sync notes on contact change
  useEffect(() => {
    if (contact) setNotes(contact.notes || "");
    setIframeFailed(false);
  }, [contact?.id]);

  // Auto-save notes
  useEffect(() => {
    if (!contact) return;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      updateContact(contact.id, { notes });
    }, 600);
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current); };
  }, [notes, contact?.id]);

  const goNext = useCallback(() => {
    // Find next ej_ringd after current index
    let next = -1;
    for (let i = currentIndex + 1; i < contacts.length; i++) {
      if (contacts[i].status === "ej_ringd") { next = i; break; }
    }
    if (next === -1) {
      // wrap around
      for (let i = 0; i < currentIndex; i++) {
        if (contacts[i].status === "ej_ringd") { next = i; break; }
      }
    }
    if (next >= 0) setCurrentIndex(next);
    else if (currentIndex < contacts.length - 1) setCurrentIndex(currentIndex + 1);
  }, [currentIndex, contacts, setCurrentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex, setCurrentIndex]);

  const handleStatusClick = useCallback((status: ContactStatus) => {
    if (!contact) return;
    // Save notes first
    updateContact(contact.id, { notes });
    setStatus(contact.id, status);
    // Auto-advance to next lead
    setTimeout(goNext, 150);
  }, [contact, notes, updateContact, setStatus, goNext]);

  const copyEmail = useCallback(() => {
    if (contact?.email) {
      navigator.clipboard.writeText(contact.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [contact?.email]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in textarea/input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case "1": handleStatusClick("svarar_ej"); break;
        case "2": handleStatusClick("nej_tack"); break;
        case "3": handleStatusClick("bokat_mote"); break;
        case "4": handleStatusClick("upptaget"); break;
        case "5": handleStatusClick("fel_nummer"); break;
        case "6": handleStatusClick("atersam"); break;
        case "7": handleStatusClick("intresserad"); break;
        case "d": case "D":
          if (contact?.direct_phone) window.open(`tel:${contact.direct_phone}`, "_self");
          break;
        case "v": case "V":
          if (contact?.switchboard) window.open(`tel:${contact.switchboard}`, "_self");
          break;
        case "n": case "N": goNext(); break;
        case "p": case "P": goPrev(); break;
        case " ": // Space to call directly
          e.preventDefault();
          if (contact?.direct_phone) window.open(`tel:${contact.direct_phone}`, "_self");
          break;
        case "?": setShowShortcuts(prev => !prev); break;
        case "Escape": onExit(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleStatusClick, goNext, goPrev, onExit, contact]);

  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center bg-telink-bg">
        <div className="text-center animate-fade-up">
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-telink-accent via-pink-500 to-telink-violet opacity-20 blur-xl animate-pulse" />
            <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-telink-accent via-pink-500 to-telink-violet flex items-center justify-center shadow-glow-md">
              <Zap size={32} className="text-telink-bg" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-telink-text mb-2">Alla leads avklarade!</h2>
          <p className="text-sm text-telink-muted mb-8">Du har gått igenom hela listan. Bra jobbat!</p>
          <button
            onClick={onExit}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-telink-accent via-pink-500 to-telink-violet text-telink-bg font-bold text-sm cursor-pointer shadow-glow-md hover:shadow-glow-lg transition-all"
          >
            Tillbaka till Dashboard
          </button>
        </div>
      </div>
    );
  }

  const websiteUrl = contact.website && !contact.website.startsWith("http")
    ? `https://${contact.website}` : contact.website;
  const linkedinUrl = contact.linkedin && !contact.linkedin.startsWith("http")
    ? `https://${contact.linkedin}` : contact.linkedin;

  // Clean company name for LinkedIn searches - take first word only (brand name)
  const cleanCompany = (contact.company || "")
    .replace(/\s+(AB|Ab|ab|HB|Hb|hb|KB|Kb|kb|EF|Ef|ef|Ek\.?\s*för\.?|Aktiebolag|Handelsbolag|Kommanditbolag)\.?\s*$/i, "")
    .trim()
    .split(/\s+/)[0] || ""; // Take first word only

  // LinkedIn search format: "Name AND Company" for better results
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact.name}${cleanCompany ? ` AND ${cleanCompany}` : ""}`)}`;

  const statusActions: ContactStatus[] = ["svarar_ej", "nej_tack", "bokat_mote", "upptaget", "fel_nummer", "atersam", "intresserad"];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-telink-bg">
      {/* Top progress bar with gradient */}
      <div className="flex-shrink-0 h-1.5 bg-telink-surface-elevated relative overflow-hidden">
        <div
          className="h-full transition-all duration-700 ease-out-expo relative"
          style={{
            width: `${pctDone}%`,
            background: "linear-gradient(90deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent" />
        </div>
        <div className="absolute top-0 right-0 h-full w-32 bg-gradient-to-l from-telink-bg to-transparent" />
      </div>

      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-telink-border bg-telink-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-telink-surface-hover transition-all text-telink-muted hover:text-telink-text cursor-pointer group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium">Avsluta</span>
          </button>
          <div className="h-6 w-px bg-telink-border" />

          {/* Position indicator with mini progress */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-telink-surface border border-telink-border">
              <span className="text-sm font-bold text-telink-text tabular-nums">{currentIndex + 1}</span>
              <span className="text-xs text-telink-dim">/</span>
              <span className="text-xs text-telink-muted tabular-nums">{total}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="p-2 rounded-lg hover:bg-telink-surface-hover transition-all text-telink-dim hover:text-telink-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goNext}
                className="p-2 rounded-lg hover:bg-telink-surface-hover transition-all text-telink-dim hover:text-telink-text cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Streak Momentum Counter - Premium styling */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            sessionCalls >= 10
              ? "bg-gradient-to-r from-orange-500/20 via-red-500/20 to-pink-500/20 border border-orange-500/40 shadow-glow-sm"
              : sessionCalls >= 5
                ? "bg-gradient-to-r from-telink-accent/15 to-pink-500/15 border border-telink-accent/30"
                : sessionCalls >= 3
                  ? "bg-telink-accent-muted border border-telink-accent/20"
                  : "bg-telink-surface border border-telink-border"
          }`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              sessionCalls >= 10
                ? "bg-gradient-to-br from-orange-500 to-red-500"
                : sessionCalls >= 5
                  ? "bg-gradient-to-br from-telink-accent to-pink-500"
                  : sessionCalls >= 3
                    ? "bg-telink-accent/20"
                    : "bg-telink-surface-elevated"
            }`}>
              {sessionCalls >= 10 ? (
                <Flame size={14} className="text-white animate-pulse" />
              ) : sessionCalls >= 5 ? (
                <Zap size={14} className="text-telink-bg" />
              ) : (
                <Phone size={12} className={sessionCalls >= 3 ? "text-telink-accent" : "text-telink-dim"} />
              )}
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-bold tabular-nums ${
                sessionCalls >= 10 ? "text-orange-400" : sessionCalls >= 5 ? "gradient-text" : sessionCalls >= 3 ? "text-telink-accent" : "text-telink-text"
              }`}>
                {sessionCalls}
              </span>
              <span className="text-[10px] text-telink-dim leading-none">samtal</span>
            </div>
            {sessionCalls >= 10 && (
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide animate-pulse">On Fire!</span>
            )}
            {sessionCalls >= 5 && sessionCalls < 10 && (
              <span className="text-[10px] font-semibold text-telink-accent uppercase tracking-wide">Streak!</span>
            )}
          </div>

          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              showShortcuts
                ? "bg-telink-accent-muted text-telink-accent border border-telink-accent/20"
                : "hover:bg-telink-surface-hover text-telink-dim hover:text-telink-text border border-transparent"
            }`}
          >
            <Keyboard size={16} />
          </button>
        </div>
      </div>

      {/* Shortcuts overlay - Premium styling */}
      {showShortcuts && (
        <div className="flex-shrink-0 px-6 py-4 bg-telink-surface-elevated border-b border-telink-border animate-fade-down">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard size={14} className="text-telink-accent" />
            <span className="text-xs font-semibold text-telink-text">Tangentbordsgenvägar</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {SHORTCUTS.map(s => (
              <div key={s.key} className="flex items-center gap-2">
                <kbd className="px-2 py-1 rounded-md bg-telink-surface border border-telink-border text-xs font-mono text-telink-accent">{s.key}</kbd>
                <span className="text-xs text-telink-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Contact info + Actions */}
        <div className="w-[440px] flex-shrink-0 flex flex-col border-r border-telink-border overflow-y-auto bg-telink-bg-subtle/30">
          {/* Contact header - Premium card */}
          <div className="p-6 border-b border-telink-border bg-gradient-to-br from-telink-surface/80 to-telink-bg">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-telink-text tracking-tight leading-tight truncate">
                  {contact.name || "Okänt namn"}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  {contact.role && <span className="text-sm text-telink-muted">{contact.role}</span>}
                  {contact.role && contact.company && <span className="text-telink-dim">•</span>}
                  {contact.company && (
                    <span className="text-sm font-medium text-telink-accent">{contact.company}</span>
                  )}
                </div>
              </div>
              {/* Best-Time Indicator - Enhanced */}
              {(() => {
                const timeInfo = getBestTimeIndicator(contact.role);
                return (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-wide ${
                      timeInfo.status === "good"
                        ? "bg-telink-success/10 text-telink-success border border-telink-success/20"
                        : timeInfo.status === "bad"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                    }`}
                    title={timeInfo.tip}
                  >
                    <Clock size={10} />
                    <span>{timeInfo.label}</span>
                  </div>
                );
              })()}
            </div>
            {contact.org_number && (
              <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-telink-surface/50 border border-telink-border/50 w-fit">
                <Hash size={11} className="text-telink-dim" />
                <span className="text-xs text-telink-dim font-mono">{contact.org_number}</span>
              </div>
            )}
          </div>

          {/* Phone actions - Premium CTA cards */}
          <div className="p-6 border-b border-telink-border space-y-3">
            {contact.direct_phone && (
              <a
                href={`tel:${contact.direct_phone}`}
                className="group relative flex items-center gap-4 w-full p-4 rounded-2xl bg-gradient-to-br from-telink-accent/10 via-pink-500/5 to-telink-violet/10 border border-telink-accent/25 hover:border-telink-accent/40 hover:shadow-glow-md transition-all overflow-hidden"
              >
                {/* Background glow */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-telink-accent/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-telink-accent to-pink-500 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow-md transition-shadow">
                  <Phone size={20} className="text-telink-bg" />
                </div>
                <div className="relative flex-1">
                  <div className="text-xs text-telink-accent/80 font-semibold uppercase tracking-wide">Ring Direkt</div>
                  <div className="text-lg font-bold font-mono text-telink-accent">{contact.direct_phone}</div>
                </div>
                <div className="relative flex flex-col items-end gap-1">
                  <kbd className="px-2 py-1 rounded-lg bg-telink-surface/50 border border-telink-border text-xs text-telink-accent">D</kbd>
                  <span className="text-[10px] text-telink-dim">eller Space</span>
                </div>
              </a>
            )}
            {contact.switchboard && (
              <a
                href={`tel:${contact.switchboard}`}
                className="group flex items-center gap-4 w-full p-3.5 rounded-xl bg-telink-surface border border-telink-border hover:bg-telink-surface-hover hover:border-telink-border-light transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-telink-surface-elevated flex items-center justify-center group-hover:bg-telink-surface transition-colors">
                  <PhoneCall size={18} className="text-telink-muted group-hover:text-telink-text transition-colors" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-telink-dim font-medium">Ring Växel</div>
                  <div className="text-sm font-mono text-telink-text-secondary">{contact.switchboard}</div>
                </div>
                <kbd className="px-2 py-1 rounded-lg bg-telink-surface-elevated border border-telink-border text-xs text-telink-muted">V</kbd>
              </a>
            )}
            {contact.email && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-telink-surface border border-telink-border">
                <Mail size={14} className="text-telink-dim flex-shrink-0" />
                <span className="text-xs text-telink-muted truncate flex-1 font-mono">{contact.email}</span>
                <button
                  onClick={copyEmail}
                  className={`p-2 rounded-lg transition-all cursor-pointer ${
                    copied
                      ? "bg-telink-success/10 text-telink-success"
                      : "hover:bg-telink-surface-hover text-telink-dim hover:text-telink-text"
                  }`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>

          {/* Status buttons - Premium grid */}
          <div className="p-6 border-b border-telink-border">
            <div className="text-xs font-semibold text-telink-dim uppercase tracking-wider mb-4">Resultat</div>
            <div className="grid grid-cols-2 gap-2.5">
              {statusActions.map(s => {
                const cfg = STATUS_CONFIG[s];
                const active = contact.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusClick(s)}
                    className={`
                      group flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-xs font-medium border transition-all cursor-pointer
                      ${active
                        ? "shadow-lg scale-[1.02]"
                        : "bg-telink-surface hover:bg-telink-surface-hover border-telink-border hover:border-current/30 hover:scale-[1.01]"
                      }
                    `}
                    style={{
                      color: cfg.color,
                      backgroundColor: active ? cfg.bg : undefined,
                      borderColor: active ? cfg.color + "44" : undefined,
                      boxShadow: active ? `0 4px 20px -4px ${cfg.color}40` : undefined,
                    }}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      active ? "" : "bg-telink-surface-elevated group-hover:scale-110"
                    }`} style={{ backgroundColor: active ? `${cfg.color}20` : undefined }}>
                      <cfg.icon size={14} />
                    </div>
                    <span className="flex-1 text-left font-semibold">{cfg.label}</span>
                    <kbd className="px-1.5 py-0.5 rounded-md bg-telink-surface/50 border border-telink-border/50 text-[10px]">{cfg.key}</kbd>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes - Premium styling */}
          <div className="flex-1 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={12} className="text-telink-dim" />
                <span className="text-xs font-semibold text-telink-dim uppercase tracking-wider">Anteckningar</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-telink-surface border border-telink-border">
                <div className="w-1.5 h-1.5 rounded-full bg-telink-success animate-pulse" />
                <span className="text-[10px] text-telink-dim">Auto-sparas</span>
              </div>
            </div>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Skriv anteckningar här..."
              className="w-full h-28 p-4 rounded-xl bg-telink-surface border border-telink-border text-sm text-telink-text placeholder-telink-dim resize-none focus:outline-none focus:border-telink-accent/40 focus:ring-2 focus:ring-telink-accent/10 transition-all"
            />
            {/* Ghost Note Templates - Premium chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { label: "Återkom", text: "Återkom kl " },
                { label: "Skicka info", text: "Skicka info om " },
                { label: "Möte bokat", text: `Möte bokat ${new Date().toLocaleDateString("sv-SE")} kl ` },
                { label: "Ej intresserad", text: "Ej intresserad - " },
                { label: "Beslutsfattare", text: "Beslutsfattare: " },
                { label: "Budget", text: "Budget: " },
              ].map(tmpl => (
                <button
                  key={tmpl.label}
                  onClick={() => {
                    const newNotes = notes + (notes && !notes.endsWith("\n") && !notes.endsWith(" ") ? "\n" : "") + tmpl.text;
                    setNotes(newNotes);
                    notesRef.current?.focus();
                  }}
                  className="group px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-telink-surface border border-telink-border text-telink-muted hover:text-telink-accent hover:border-telink-accent/30 hover:bg-telink-accent/5 transition-all cursor-pointer"
                >
                  <span className="opacity-50 group-hover:opacity-100 transition-opacity">+</span> {tmpl.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Research Engine */}
        <div className="flex-1 flex flex-col overflow-hidden bg-telink-bg">
          {/* Research tabs - Premium styling */}
          <div className="flex-shrink-0 flex items-center gap-2 px-5 pt-4 pb-0">
            <div className="flex items-center bg-telink-surface rounded-xl p-1 border border-telink-border">
              <button
                onClick={() => { setResearchTab("website"); setIframeFailed(false); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  researchTab === "website"
                    ? "bg-telink-accent text-telink-bg shadow-glow-sm"
                    : "text-telink-muted hover:text-telink-text"
                }`}
              >
                <Globe size={14} /> Hemsida
              </button>
              <button
                onClick={() => setResearchTab("linkedin")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  researchTab === "linkedin"
                    ? "bg-[#0a66c2] text-white shadow-lg"
                    : "text-telink-muted hover:text-telink-text"
                }`}
              >
                <Linkedin size={14} /> LinkedIn
              </button>
            </div>

            {/* Open in new tab - Premium button */}
            <div className="ml-auto">
              {researchTab === "website" && websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telink-dim hover:text-telink-text bg-telink-surface border border-telink-border hover:border-telink-border-light transition-all"
                >
                  <ExternalLink size={12} /> Öppna i ny flik
                </a>
              )}
              {researchTab === "linkedin" && (
                <a
                  href={linkedinUrl || linkedinSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telink-dim hover:text-telink-text bg-telink-surface border border-telink-border hover:border-telink-border-light transition-all"
                >
                  <ExternalLink size={12} /> Öppna i ny flik
                </a>
              )}
            </div>
          </div>

          {/* Research content - Premium container */}
          <div className="flex-1 m-5 mt-3 rounded-2xl border border-telink-border overflow-hidden bg-telink-surface shadow-elevation-1">
            {researchTab === "website" ? (
              websiteUrl && !iframeFailed ? (
                <iframe
                  key={websiteUrl}
                  src={websiteUrl}
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  onError={() => setIframeFailed(true)}
                  title="Företagets hemsida"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-telink-surface-elevated flex items-center justify-center">
                      <Globe size={32} className="text-telink-dim" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-telink-accent flex items-center justify-center">
                      <ExternalLink size={12} className="text-telink-bg" />
                    </div>
                  </div>
                  {websiteUrl ? (
                    <>
                      <p className="text-base font-semibold text-telink-text mb-2">Hemsidan blockerar iframe</p>
                      <p className="text-sm text-telink-muted mb-6 max-w-xs">Många sidor tillåter inte inbäddning. Öppna istället i en ny flik.</p>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-telink-accent to-pink-500 text-telink-bg text-sm font-bold hover:shadow-glow-md transition-all"
                      >
                        <ExternalLink size={14} /> Öppna {new URL(websiteUrl).hostname}
                      </a>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-telink-text mb-2">Ingen hemsida angiven</p>
                      <p className="text-sm text-telink-muted mb-6">Denna kontakt har ingen URL i datasetet.</p>
                      {contact.company && (
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(contact.company)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-telink-border bg-telink-surface-elevated text-sm font-medium text-telink-text hover:bg-telink-surface-hover hover:border-telink-border-light transition-all"
                        >
                          <Search size={14} /> Sök &quot;{contact.company}&quot; på Google
                        </a>
                      )}
                    </>
                  )}
                </div>
              )
            ) : (
              /* LinkedIn tab - Premium enhanced view */
              <div className="h-full flex flex-col overflow-hidden">
                {/* LinkedIn Profile Card - Premium styling */}
                <div className="p-6 border-b border-telink-border bg-gradient-to-br from-[#0a66c2]/10 via-[#0a66c2]/5 to-transparent">
                  <div className="flex items-start gap-5">
                    {/* Avatar placeholder - Premium */}
                    <div className="relative">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0a66c2]/20 to-[#0a66c2]/5 border border-[#0a66c2]/20 flex items-center justify-center flex-shrink-0">
                        <Linkedin size={32} className="text-[#0a66c2]" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[#0a66c2] flex items-center justify-center shadow-lg">
                        <Search size={12} className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-telink-text">{contact.name}</h3>
                      {contact.role && (
                        <p className="text-sm text-telink-muted mt-1">{contact.role}</p>
                      )}
                      {contact.company && (
                        <div className="flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-lg bg-[#0a66c2]/10 border border-[#0a66c2]/20 w-fit">
                          <Building2 size={12} className="text-[#0a66c2]" />
                          <span className="text-sm font-medium text-[#0a66c2]">{contact.company}</span>
                        </div>
                      )}
                      {linkedinUrl && (
                        <p className="text-xs text-telink-dim mt-3 truncate font-mono">{linkedinUrl}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions - Premium cards */}
                <div className="flex-1 p-5 space-y-3 overflow-y-auto">
                  <div className="text-[10px] font-semibold text-telink-dim uppercase tracking-wider mb-4">Snabbåtgärder</div>

                  {linkedinUrl ? (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-4 w-full p-4 rounded-2xl bg-gradient-to-r from-[#0a66c2] to-[#004182] text-white hover:shadow-lg transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Linkedin size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-bold">Öppna LinkedIn-profil</div>
                        <div className="text-xs opacity-70">Visa fullständig profil</div>
                      </div>
                      <ExternalLink size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <a
                      href={linkedinSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-4 w-full p-4 rounded-2xl bg-gradient-to-r from-[#0a66c2] to-[#004182] text-white hover:shadow-lg transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Search size={20} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-bold">Sök på LinkedIn</div>
                        <div className="text-xs opacity-70">&quot;{contact.name}{cleanCompany ? ` AND ${cleanCompany}` : ""}&quot;</div>
                      </div>
                      <ExternalLink size={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                  )}

                  {/* Company search */}
                  {contact.company && (
                    <a
                      href={`https://www.linkedin.com/company/${encodeURIComponent(cleanCompany.toLowerCase().replace(/\s+/g, "-").replace(/[åä]/g, "a").replace(/ö/g, "o"))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-4 w-full p-3.5 rounded-xl border border-[#0a66c2]/25 bg-[#0a66c2]/5 hover:bg-[#0a66c2]/10 hover:border-[#0a66c2]/40 transition-all"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#0a66c2]/10 flex items-center justify-center">
                        <Building2 size={16} className="text-[#0a66c2]" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-semibold text-telink-text">Företagssida</div>
                        <div className="text-xs text-telink-muted">{contact.company}</div>
                      </div>
                      <ExternalLink size={14} className="text-telink-dim group-hover:text-[#0a66c2] transition-colors" />
                    </a>
                  )}

                  {/* Sales Navigator search */}
                  <a
                    href={`https://www.linkedin.com/sales/search/people?query=(keywords:${encodeURIComponent(`${contact.name}${cleanCompany ? ` AND ${cleanCompany}` : ""}`)})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 w-full p-3.5 rounded-xl border border-telink-border bg-telink-surface-elevated hover:bg-telink-surface-hover hover:border-telink-border-light transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-telink-surface flex items-center justify-center">
                      <Search size={16} className="text-telink-muted group-hover:text-telink-accent transition-colors" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-telink-text">Sales Navigator</div>
                      <div className="text-xs text-telink-muted">Avancerad sökning</div>
                    </div>
                    <ExternalLink size={14} className="text-telink-dim" />
                  </a>

                  {/* Google search for LinkedIn */}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`"${contact.name}" "${cleanCompany}" site:linkedin.com`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 w-full p-3.5 rounded-xl border border-telink-border bg-telink-surface-elevated hover:bg-telink-surface-hover hover:border-telink-border-light transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-telink-surface flex items-center justify-center">
                      <Globe size={16} className="text-telink-muted group-hover:text-telink-accent transition-colors" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-telink-text">Google → LinkedIn</div>
                      <div className="text-xs text-telink-muted">Sök via Google</div>
                    </div>
                    <ExternalLink size={14} className="text-telink-dim" />
                  </a>
                </div>

                {/* Tips section - Premium styling */}
                <div className="p-4 border-t border-telink-border bg-gradient-to-r from-telink-surface to-telink-bg">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-telink-surface-elevated border border-telink-border">
                    <div className="w-8 h-8 rounded-lg bg-telink-accent/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare size={14} className="text-telink-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-telink-text mb-0.5">Pro Tips</p>
                      <p className="text-[11px] text-telink-muted leading-relaxed">
                        Använd Sales Navigator för att se gemensamma kontakter och senaste aktivitet.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
