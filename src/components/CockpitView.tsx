"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Phone, PhoneCall, X, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, MessageSquare, Keyboard, Building2, Mail, Hash,
  SkipForward, ArrowLeft, Search, Copy, Check
} from "lucide-react";
import type { Contact, ContactStatus } from "@/types";
import { STATUS_CONFIG, SHORTCUTS } from "@/lib/constants";

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
        case "?": setShowShortcuts(prev => !prev); break;
        case "Escape": onExit(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleStatusClick, goNext, goPrev, onExit, contact]);

  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-telink-text mb-2">Alla leads avklarade!</h2>
          <p className="text-sm text-telink-muted mb-6">Du har gått igenom hela listan.</p>
          <button onClick={onExit} className="px-5 py-2.5 rounded-xl bg-[#2bb574] text-white font-semibold text-sm cursor-pointer">
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
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact.name} ${contact.company}`)}`;

  const statusActions: ContactStatus[] = ["svarar_ej", "nej_tack", "bokat_mote", "upptaget", "fel_nummer", "atersam", "intresserad"];

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in">
      {/* Top progress bar */}
      <div className="flex-shrink-0 h-1 bg-telink-surface">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${pctDone}%`,
            background: "linear-gradient(90deg, #2bb574, #2bb574)",
            boxShadow: "0 0 10px rgba(43,181,116,0.3)"
          }}
        />
      </div>

      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-telink-border bg-telink-surface/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="p-2 rounded-lg hover:bg-telink-surface-hover transition-colors text-telink-muted hover:text-telink-text cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div className="h-5 w-px bg-telink-border" />
          <span className="text-xs text-telink-muted font-mono">{currentIndex + 1} / {total}</span>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} disabled={currentIndex === 0} className="p-1.5 rounded-lg hover:bg-telink-surface-hover transition-colors text-telink-dim hover:text-telink-text disabled:opacity-30 cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-telink-surface-hover transition-colors text-telink-dim hover:text-telink-text cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-telink-dim">{sessionCalls} samtal idag</span>
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${showShortcuts ? "bg-[rgba(43,181,116,0.1)] text-[#2bb574]" : "hover:bg-telink-surface-hover text-telink-dim hover:text-telink-text"}`}
          >
            <Keyboard size={15} />
          </button>
        </div>
      </div>

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div className="flex-shrink-0 px-5 py-3 bg-telink-surface border-b border-telink-border animate-slide-up">
          <div className="flex flex-wrap gap-3">
            {SHORTCUTS.map(s => (
              <div key={s.key} className="flex items-center gap-1.5">
                <kbd>{s.key}</kbd>
                <span className="text-xs text-telink-dim">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Contact info + Actions */}
        <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-telink-border overflow-y-auto">
          {/* Contact header */}
          <div className="p-5 border-b border-telink-border">
            <h2 className="text-xl font-bold text-telink-text tracking-tight leading-tight">
              {contact.name || "Okänt namn"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {contact.role && <span className="text-sm text-telink-muted">{contact.role}</span>}
              {contact.role && contact.company && <span className="text-telink-dim">•</span>}
              {contact.company && (
                <span className="text-sm font-medium text-[#2bb574]/80">{contact.company}</span>
              )}
            </div>
            {contact.org_number && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Hash size={11} className="text-telink-dim" />
                <span className="text-xs text-telink-dim font-mono">{contact.org_number}</span>
              </div>
            )}
          </div>

          {/* Phone actions */}
          <div className="p-5 border-b border-telink-border space-y-2.5">
            {contact.direct_phone && (
              <a
                href={`tel:${contact.direct_phone}`}
                className="group flex items-center gap-3 w-full p-3.5 rounded-xl bg-[rgba(43,181,116,0.08)] border border-[rgba(43,181,116,0.2)] hover:bg-[rgba(43,181,116,0.14)] hover:shadow-[0_0_20px_rgba(43,181,116,0.15)] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2bb574] flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(43,181,116,0.4)] transition-shadow">
                  <Phone size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-xs text-[#2bb574]/70 font-medium">Ring Direkt</div>
                  <div className="text-sm font-bold font-mono text-[#2bb574]">{contact.direct_phone}</div>
                </div>
                <kbd className="ml-auto">D</kbd>
              </a>
            )}
            {contact.switchboard && (
              <a
                href={`tel:${contact.switchboard}`}
                className="group flex items-center gap-3 w-full p-3 rounded-xl bg-telink-surface border border-telink-border hover:bg-telink-surface-hover hover:border-telink-border-light transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-telink-surface-light flex items-center justify-center">
                  <PhoneCall size={16} className="text-telink-muted" />
                </div>
                <div>
                  <div className="text-xs text-telink-dim font-medium">Ring Växel</div>
                  <div className="text-sm font-mono text-telink-muted">{contact.switchboard}</div>
                </div>
                <kbd className="ml-auto">V</kbd>
              </a>
            )}
            {contact.email && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-telink-surface border border-telink-border">
                <Mail size={14} className="text-telink-dim flex-shrink-0" />
                <span className="text-xs text-telink-muted truncate flex-1">{contact.email}</span>
                <button onClick={copyEmail} className="p-1.5 rounded-lg hover:bg-telink-surface-hover transition-colors text-telink-dim hover:text-telink-text cursor-pointer">
                  {copied ? <Check size={13} className="text-[#2bb574]" /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </div>

          {/* Status buttons */}
          <div className="p-5 border-b border-telink-border">
            <div className="text-xs font-semibold text-telink-dim uppercase tracking-wider mb-3">Resultat</div>
            <div className="grid grid-cols-2 gap-2">
              {statusActions.map(s => {
                const cfg = STATUS_CONFIG[s];
                const active = contact.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusClick(s)}
                    className={`
                      status-btn flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all cursor-pointer
                      ${active
                        ? "border-current shadow-lg"
                        : "border-telink-border hover:border-current/30 bg-telink-surface hover:bg-opacity-100"
                      }
                    `}
                    style={{
                      color: cfg.color,
                      backgroundColor: active ? cfg.bg : undefined,
                      borderColor: active ? cfg.color + "44" : undefined,
                    }}
                  >
                    <cfg.icon size={13} />
                    <span className="flex-1 text-left">{cfg.label}</span>
                    <kbd>{cfg.key}</kbd>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="flex-1 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-telink-dim uppercase tracking-wider">Anteckningar</div>
              <div className="text-[10px] text-telink-dim">Auto-sparas</div>
            </div>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Skriv anteckningar här..."
              className="w-full h-32 p-3 rounded-xl bg-telink-surface border border-telink-border text-sm text-telink-text placeholder-telink-dim resize-none focus:outline-none focus:border-[#2bb574]/40 transition-colors"
            />
          </div>
        </div>

        {/* RIGHT: Research Engine */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Research tabs */}
          <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 pb-0">
            <button
              onClick={() => { setResearchTab("website"); setIframeFailed(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-medium border border-b-0 transition-all cursor-pointer ${
                researchTab === "website"
                  ? "bg-telink-surface border-telink-border text-[#2bb574]"
                  : "border-transparent text-telink-dim hover:text-telink-muted"
              }`}
            >
              <Globe size={14} /> Hemsida
            </button>
            <button
              onClick={() => setResearchTab("linkedin")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-medium border border-b-0 transition-all cursor-pointer ${
                researchTab === "linkedin"
                  ? "bg-telink-surface border-telink-border text-[#2bb574]"
                  : "border-transparent text-telink-dim hover:text-telink-muted"
              }`}
            >
              <Linkedin size={14} /> LinkedIn
            </button>
            {/* Open in new tab */}
            {researchTab === "website" && websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-telink-dim hover:text-telink-text hover:bg-telink-surface-hover transition-all"
              >
                <ExternalLink size={12} /> Öppna i ny flik
              </a>
            )}
            {researchTab === "linkedin" && (
              <a
                href={linkedinUrl || linkedinSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-telink-dim hover:text-telink-text hover:bg-telink-surface-hover transition-all"
              >
                <ExternalLink size={12} /> Öppna i ny flik
              </a>
            )}
          </div>

          {/* Research content */}
          <div className="flex-1 m-4 mt-0 rounded-xl border border-telink-border overflow-hidden bg-telink-surface">
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
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-telink-surface-light flex items-center justify-center mb-4">
                    <Globe size={28} className="text-telink-dim" />
                  </div>
                  {websiteUrl ? (
                    <>
                      <p className="text-sm font-medium text-telink-text mb-1">Hemsidan blockerar iframe</p>
                      <p className="text-xs text-telink-muted mb-4">Många sidor tillåter inte inbäddning. Öppna istället i en ny flik.</p>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2bb574] text-white text-sm font-semibold hover:shadow-[0_0_25px_rgba(43,181,116,0.3)] transition-all"
                      >
                        <ExternalLink size={14} /> Öppna {new URL(websiteUrl).hostname}
                      </a>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-telink-text mb-1">Ingen hemsida angiven</p>
                      <p className="text-xs text-telink-muted">Denna kontakt har ingen URL i datasetet.</p>
                      {contact.company && (
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(contact.company)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl border border-telink-border bg-telink-surface-light text-sm text-telink-text hover:bg-telink-surface-hover transition-all"
                        >
                          <Search size={14} /> Sök &quot;{contact.company}&quot; på Google
                        </a>
                      )}
                    </>
                  )}
                </div>
              )
            ) : (
              /* LinkedIn tab */
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[rgba(10,102,194,0.12)] flex items-center justify-center mb-4">
                  <Linkedin size={28} className="text-[#0a66c2]" />
                </div>
                {linkedinUrl ? (
                  <>
                    <p className="text-sm font-medium text-telink-text mb-1">LinkedIn-profil hittad</p>
                    <p className="text-xs text-telink-muted mb-4 break-all max-w-md">{linkedinUrl}</p>
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#0855a3] transition-all"
                    >
                      <Linkedin size={14} /> Öppna LinkedIn-profil
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-telink-text mb-1">Ingen LinkedIn-länk</p>
                    <p className="text-xs text-telink-muted mb-4">Sök efter denna person på LinkedIn:</p>
                    <a
                      href={linkedinSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#0855a3] transition-all"
                    >
                      <Search size={14} /> Sök &quot;{contact.name} {contact.company}&quot;
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
