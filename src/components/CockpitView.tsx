"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneCall, Globe, Linkedin, ChevronLeft, ChevronRight,
  ExternalLink, MessageSquare, Building2, Mail, Hash,
  ArrowLeft, Search, Copy, Check, Clock, Command, CornerDownLeft,
  LayoutGrid, Settings, BarChart3,
  ChevronUp, ChevronDown
} from "lucide-react";
import type { Contact, ContactStatus, ViewMode } from "@/types";
import { STATUS_CONFIG, SHORTCUTS } from "@/lib/constants";

// ============================================
// UTILITY: Best-Time Indicator
// ============================================
function getBestTimeIndicator(role: string | undefined): { status: "good" | "ok" | "bad"; label: string; tip: string } {
  const now = new Date();
  const hour = now.getHours();
  const roleLower = (role || "").toLowerCase();

  if (roleLower.includes("vd") || roleLower.includes("ceo") || roleLower.includes("grundare") || roleLower.includes("founder")) {
    if ((hour >= 8 && hour < 9) || (hour >= 16 && hour < 17)) {
      return { status: "good", label: "Bra tid", tip: "VD:ar nås bäst tidigt eller sent" };
    } else if (hour >= 12 && hour < 14) {
      return { status: "bad", label: "Upptagen", tip: "Lunchtid - ofta möten" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara i möte" };
  }

  if (roleLower.includes("sales") || roleLower.includes("säljare") || roleLower.includes("account")) {
    if (hour >= 14 && hour < 16) {
      return { status: "good", label: "Bra tid", tip: "Säljare ofta vid datorn nu" };
    } else if (hour >= 9 && hour < 12) {
      return { status: "bad", label: "Ute säljande", tip: "Ofta på kundmöten" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara upptagen" };
  }

  if (roleLower.includes("cto") || roleLower.includes("tech") || roleLower.includes("utvecklare") || roleLower.includes("developer")) {
    if ((hour >= 8 && hour < 10) || (hour >= 16 && hour < 17)) {
      return { status: "good", label: "Bra tid", tip: "Innan/efter fokustid" };
    } else if (hour >= 10 && hour < 15) {
      return { status: "bad", label: "Fokustid", tip: "Tekniker stör ej ogärna" };
    }
    return { status: "ok", label: "Försök", tip: "Kan vara i kodfokus" };
  }

  if ((hour >= 10 && hour < 12) || (hour >= 14 && hour < 16)) {
    return { status: "good", label: "Bra tid", tip: "Generellt bra tidpunkt" };
  } else if (hour >= 12 && hour < 13) {
    return { status: "bad", label: "Lunchtid", tip: "Ofta upptagen med lunch" };
  }
  return { status: "ok", label: "Okänd", tip: "Pröva lyckan!" };
}

// ============================================
// COMPONENT: Command Palette (CMD+K)
// ============================================
interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category?: string;
}

function CommandPalette({
  isOpen,
  onClose,
  items,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter(item =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, filtered, selectedIndex, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="command-palette-overlay"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="command-palette"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-cockpit-border">
            <Search size={16} className="text-cockpit-text-dim" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
              placeholder="Sök kommandon..."
              className="flex-1 bg-transparent text-cockpit-text placeholder:text-cockpit-text-dim outline-none text-sm"
            />
            <kbd className="text-2xs">ESC</kbd>
          </div>
          <div className="command-palette-list">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-cockpit-text-dim text-sm">
                Inga kommandon hittades
              </div>
            ) : (
              filtered.map((item, i) => (
                <div
                  key={item.id}
                  className={`command-palette-item ${i === selectedIndex ? "selected" : ""}`}
                  onClick={() => { onSelect(item); onClose(); }}
                >
                  <span className="text-cockpit-text-muted">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-4 px-4 py-2 border-t border-cockpit-border bg-cockpit-bg-subtle text-2xs text-cockpit-text-dim">
            <span className="flex items-center gap-1"><ChevronUp size={10} /><ChevronDown size={10} /> navigera</span>
            <span className="flex items-center gap-1"><CornerDownLeft size={10} /> välj</span>
            <span className="flex items-center gap-1"><kbd className="text-2xs px-1">ESC</kbd> stäng</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// COMPONENT: Key Press Indicator
// ============================================
function KeyIndicator({ keyPressed }: { keyPressed: string | null }) {
  if (!keyPressed) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="key-indicator"
    >
      <kbd className="pressed">{keyPressed}</kbd>
      <span>tryckt</span>
    </motion.div>
  );
}

// ============================================
// COMPONENT: Navigation Rail
// ============================================
function NavigationRail({
  onExit,
  onNavigate
}: {
  onExit: () => void;
  onNavigate: (view: ViewMode) => void;
}) {
  return (
    <div className="nav-rail">
      <button
        onClick={onExit}
        className="nav-rail-item mb-auto"
        title="Tillbaka till Dashboard"
      >
        <ArrowLeft size={18} strokeWidth={1.5} />
      </button>

      <div className="flex flex-col gap-1">
        <button
          className="nav-rail-item active"
          title="Dialer (aktiv)"
        >
          <Phone size={18} strokeWidth={1.5} />
        </button>
        <button
          className="nav-rail-item"
          title="Dashboard"
          onClick={() => onNavigate("dashboard")}
        >
          <LayoutGrid size={18} strokeWidth={1.5} />
        </button>
        <button
          className="nav-rail-item"
          title="Statistik"
          onClick={() => onNavigate("stats")}
        >
          <BarChart3 size={18} strokeWidth={1.5} />
        </button>
      </div>

      <button
        className="nav-rail-item mt-auto"
        title="Inställningar"
        onClick={() => onNavigate("settings")}
      >
        <Settings size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ============================================
// COMPONENT: Lead Stream (Contact List)
// ============================================
function LeadStream({
  contacts,
  currentIndex,
  onSelect,
}: {
  contacts: Contact[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to active item
    const el = listRef.current?.querySelector(`[data-index="${currentIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  const getStatusColor = (status: ContactStatus) => {
    const cfg = STATUS_CONFIG[status];
    return cfg?.color || "#71717a";
  };

  return (
    <div className="w-64 flex-shrink-0 flex flex-col" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            Leads
          </h3>
          <span className="text-2xs tabular-nums" style={{ color: "var(--text-dim)" }}>
            {contacts.filter(c => c.status !== "ej_ringd").length}/{contacts.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {contacts.map((contact, index) => {
          const isActive = index === currentIndex;
          const statusColor = getStatusColor(contact.status);

          return (
            <motion.div
              key={contact.id}
              data-index={index}
              onClick={() => onSelect(index)}
              className={`lead-card ${isActive ? "active" : ""}`}
              whileHover={{ x: isActive ? 0 : 2 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-start gap-3">
                {/* Status indicator */}
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: statusColor }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                    {contact.name || "Okänt namn"}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {contact.company}
                  </p>
                </div>
                {contact.status === "bokat_mote" && (
                  <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: "var(--success-bg)" }}>
                    <Check size={10} style={{ color: "var(--success)" }} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT: CockpitView
// ============================================
interface CockpitViewProps {
  contacts: Contact[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  setStatus: (id: string, status: ContactStatus) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  onExit: () => void;
  onNavigate: (view: ViewMode) => void;
  sessionCalls: number;
}

export function CockpitView({
  contacts, currentIndex, setCurrentIndex, setStatus, updateContact, onExit, onNavigate, sessionCalls
}: CockpitViewProps) {
  const [researchTab, setResearchTab] = useState<"website" | "linkedin">("website");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [keyPressed, setKeyPressed] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const contact = contacts[currentIndex];
  const total = contacts.length;
  const worked = contacts.filter(c => c.status !== "ej_ringd").length;

  // Sync notes on contact change
  useEffect(() => {
    if (contact) setNotes(contact.notes || "");
    setIframeFailed(false);
  }, [contact?.id]);

  // Auto-save notes with debounce
  useEffect(() => {
    if (!contact) return;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      updateContact(contact.id, { notes });
    }, 600);
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current); };
  }, [notes, contact?.id, updateContact]);

  const goNext = useCallback(() => {
    let next = -1;
    for (let i = currentIndex + 1; i < contacts.length; i++) {
      if (contacts[i].status === "ej_ringd") { next = i; break; }
    }
    if (next === -1) {
      for (let i = 0; i < currentIndex; i++) {
        if (contacts[i].status === "ej_ringd") { next = i; break; }
      }
    }
    if (next >= 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(next);
        setIsTransitioning(false);
      }, 150);
    } else if (currentIndex < contacts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, contacts, setCurrentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex, setCurrentIndex]);

  const handleStatusClick = useCallback((status: ContactStatus) => {
    if (!contact) return;
    updateContact(contact.id, { notes });
    setStatus(contact.id, status);

    // Animate out then advance
    setIsTransitioning(true);
    setTimeout(() => {
      goNext();
      setIsTransitioning(false);
    }, 200);
  }, [contact, notes, updateContact, setStatus, goNext]);

  const copyEmail = useCallback(() => {
    if (contact?.email) {
      navigator.clipboard.writeText(contact.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [contact?.email]);

  // Show key press indicator
  const flashKey = useCallback((key: string) => {
    setKeyPressed(key);
    setTimeout(() => setKeyPressed(null), 300);
  }, []);

  // Command palette items
  const commandItems: CommandItem[] = useMemo(() => [
    { id: "call-direct", label: "Ring direkt", icon: <Phone size={14} />, shortcut: "D", action: () => contact?.direct_phone && window.open(`tel:${contact.direct_phone}`, "_self"), category: "Samtal" },
    { id: "call-switch", label: "Ring växel", icon: <PhoneCall size={14} />, shortcut: "V", action: () => contact?.switchboard && window.open(`tel:${contact.switchboard}`, "_self"), category: "Samtal" },
    { id: "next", label: "Nästa lead", icon: <ChevronRight size={14} />, shortcut: "N", action: goNext, category: "Navigation" },
    { id: "prev", label: "Föregående", icon: <ChevronLeft size={14} />, shortcut: "P", action: goPrev, category: "Navigation" },
    { id: "exit", label: "Avsluta dialer", icon: <ArrowLeft size={14} />, shortcut: "ESC", action: onExit, category: "Navigation" },
    { id: "status-1", label: "Svarar ej", icon: <span className="w-2 h-2 rounded-full bg-amber-500" />, shortcut: "1", action: () => handleStatusClick("svarar_ej"), category: "Status" },
    { id: "status-2", label: "Nej tack", icon: <span className="w-2 h-2 rounded-full bg-red-500" />, shortcut: "2", action: () => handleStatusClick("nej_tack"), category: "Status" },
    { id: "status-3", label: "Bokat möte", icon: <span className="w-2 h-2 rounded-full bg-green-500" />, shortcut: "3", action: () => handleStatusClick("bokat_mote"), category: "Status" },
    { id: "status-4", label: "Upptaget", icon: <span className="w-2 h-2 rounded-full bg-orange-500" />, shortcut: "4", action: () => handleStatusClick("upptaget"), category: "Status" },
    { id: "status-5", label: "Fel nummer", icon: <span className="w-2 h-2 rounded-full bg-red-400" />, shortcut: "5", action: () => handleStatusClick("fel_nummer"), category: "Status" },
    { id: "status-6", label: "Återsamtal", icon: <span className="w-2 h-2 rounded-full bg-blue-500" />, shortcut: "6", action: () => handleStatusClick("atersam"), category: "Status" },
    { id: "status-7", label: "Intresserad", icon: <span className="w-2 h-2 rounded-full bg-purple-500" />, shortcut: "7", action: () => handleStatusClick("intresserad"), category: "Status" },
  ], [contact, goNext, goPrev, onExit, handleStatusClick]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      // CMD+K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      switch (e.key) {
        case "1": flashKey("1"); handleStatusClick("svarar_ej"); break;
        case "2": flashKey("2"); handleStatusClick("nej_tack"); break;
        case "3": flashKey("3"); handleStatusClick("bokat_mote"); break;
        case "4": flashKey("4"); handleStatusClick("upptaget"); break;
        case "5": flashKey("5"); handleStatusClick("fel_nummer"); break;
        case "6": flashKey("6"); handleStatusClick("atersam"); break;
        case "7": flashKey("7"); handleStatusClick("intresserad"); break;
        case "d": case "D":
          flashKey("D");
          if (contact?.direct_phone) window.open(`tel:${contact.direct_phone}`, "_self");
          break;
        case "v": case "V":
          flashKey("V");
          if (contact?.switchboard) window.open(`tel:${contact.switchboard}`, "_self");
          break;
        case "n": case "N": flashKey("N"); goNext(); break;
        case "p": case "P": flashKey("P"); goPrev(); break;
        case " ":
          e.preventDefault();
          flashKey("␣");
          if (contact?.direct_phone) window.open(`tel:${contact.direct_phone}`, "_self");
          break;
        case "?": setShowShortcuts(prev => !prev); break;
        case "Escape":
          if (showShortcuts) setShowShortcuts(false);
          else onExit();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleStatusClick, goNext, goPrev, onExit, contact, flashKey, showShortcuts]);

  // All done state
  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center bg-cockpit-bg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-cockpit-success-bg flex items-center justify-center">
            <Check size={28} className="text-cockpit-success" />
          </div>
          <h2 className="text-xl font-semibold text-cockpit-text mb-2">
            Alla leads avklarade
          </h2>
          <p className="text-sm text-cockpit-text-muted mb-8">
            Du har gått igenom hela listan. Bra jobbat!
          </p>
          <button
            onClick={onExit}
            className="btn-primary px-6 py-2.5"
          >
            Tillbaka till Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  const websiteUrl = contact.website && !contact.website.startsWith("http")
    ? `https://${contact.website}` : contact.website;
  const linkedinUrl = contact.linkedin && !contact.linkedin.startsWith("http")
    ? `https://${contact.linkedin}` : contact.linkedin;

  const cleanCompany = (contact.company || "")
    .replace(/\s+(AB|Ab|ab|HB|Hb|hb|KB|Kb|kb|EF|Ef|ef|Ek\.?\s*för\.?|Aktiebolag|Handelsbolag|Kommanditbolag)\.?\s*$/i, "")
    .trim()
    .split(/\s+/)[0] || "";

  const linkedinSearchUrl = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact.name}${cleanCompany ? ` AND ${cleanCompany}` : ""}`)}`;

  const statusActions: ContactStatus[] = ["svarar_ej", "nej_tack", "bokat_mote", "upptaget", "fel_nummer", "atersam", "intresserad"];
  const timeInfo = getBestTimeIndicator(contact.role);

  return (
    <div className="h-full flex overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={commandItems}
        onSelect={(item) => item.action()}
      />

      {/* Key Press Indicator */}
      <AnimatePresence>
        {keyPressed && <KeyIndicator keyPressed={keyPressed} />}
      </AnimatePresence>

      {/* Navigation Rail */}
      <NavigationRail onExit={onExit} onNavigate={onNavigate} />

      {/* Lead Stream */}
      <LeadStream
        contacts={contacts}
        currentIndex={currentIndex}
        onSelect={setCurrentIndex}
      />

      {/* Focus Stage - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-cockpit-border bg-cockpit-surface">
          <div className="flex items-center gap-4">
            {/* Position indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-cockpit-bg border border-cockpit-border">
              <span className="text-sm font-semibold text-cockpit-text tabular-nums">{currentIndex + 1}</span>
              <span className="text-xs text-cockpit-text-dim">/</span>
              <span className="text-xs text-cockpit-text-muted tabular-nums">{total}</span>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="p-2 rounded-md hover:bg-cockpit-surface-hover transition-colors text-cockpit-text-dim hover:text-cockpit-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goNext}
                className="p-2 rounded-md hover:bg-cockpit-surface-hover transition-colors text-cockpit-text-dim hover:text-cockpit-text cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Progress bar + Stats */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-lg font-semibold text-cockpit-text tabular-nums">{sessionCalls}</p>
                <p className="text-2xs text-cockpit-text-dim">Samtal</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-cockpit-success tabular-nums">
                  {contacts.filter(c => c.status === "bokat_mote").length}
                </p>
                <p className="text-2xs text-cockpit-text-dim">Möten</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-cockpit-text tabular-nums">{total - worked}</p>
                <p className="text-2xs text-cockpit-text-dim">Kvar</p>
              </div>
            </div>

            <div className="w-32">
              <div className="h-1.5 bg-cockpit-bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-cockpit-success rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(worked / total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-2xs text-cockpit-text-dim text-center mt-1">{Math.round((worked / total) * 100)}% klart</p>
            </div>
          </div>

          {/* Shortcuts toggle */}
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              showShortcuts
                ? "bg-cockpit-bg border border-cockpit-border-strong text-cockpit-text"
                : "text-cockpit-text-muted hover:text-cockpit-text hover:bg-cockpit-surface-hover"
            }`}
          >
            <kbd className="text-2xs">?</kbd>
            <span>Genvägar</span>
          </button>
        </div>

        {/* Shortcuts panel */}
        <AnimatePresence>
          {showShortcuts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden border-b border-cockpit-border bg-cockpit-bg-subtle"
            >
              <div className="px-6 py-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {SHORTCUTS.map(s => (
                    <div key={s.key} className="flex items-center gap-2">
                      <kbd>{s.key}</kbd>
                      <span className="text-xs text-cockpit-text-muted">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content split */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Contact Profile + Actions */}
          <motion.div
            key={contact.id}
            initial={isTransitioning ? { opacity: 0, x: 20 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-[380px] flex-shrink-0 flex flex-col overflow-y-auto border-r border-cockpit-border bg-cockpit-surface"
          >
            {/* Contact header */}
            <div className="p-6 border-b border-cockpit-border">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-cockpit-text tracking-tight truncate">
                    {contact.name || "Okänt namn"}
                  </h2>
                </div>
                {/* Time indicator */}
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-medium ${
                    timeInfo.status === "good"
                      ? "bg-cockpit-success-bg text-cockpit-success"
                      : timeInfo.status === "bad"
                        ? "bg-cockpit-danger-bg text-cockpit-danger"
                        : "bg-cockpit-warning-bg text-cockpit-warning"
                  }`}
                  title={timeInfo.tip}
                >
                  <Clock size={10} />
                  <span>{timeInfo.label}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-cockpit-text-muted">
                {contact.role && <span>{contact.role}</span>}
                {contact.role && contact.company && <span className="text-cockpit-text-dim">·</span>}
                {contact.company && <span>{contact.company}</span>}
              </div>

              {contact.org_number && (
                <div className="flex items-center gap-1.5 mt-3 text-2xs text-cockpit-text-dim font-mono">
                  <Hash size={10} />
                  <span>{contact.org_number}</span>
                </div>
              )}
            </div>

            {/* Phone actions */}
            <div className="p-4 border-b border-cockpit-border space-y-2">
              {contact.direct_phone && (
                <motion.a
                  href={`tel:${contact.direct_phone}`}
                  className="group flex items-center gap-3 w-full p-3 rounded-lg bg-cockpit-success-bg border border-cockpit-success/20 hover:border-cockpit-success/40 transition-all"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-10 h-10 rounded-lg bg-cockpit-success flex items-center justify-center shadow-button">
                    <Phone size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cockpit-success font-medium">Ring Direkt</p>
                    <p className="text-base font-mono font-semibold text-cockpit-text">{contact.direct_phone}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <kbd>D</kbd>
                  </div>
                </motion.a>
              )}

              {contact.switchboard && (
                <a
                  href={`tel:${contact.switchboard}`}
                  className="flex items-center gap-3 w-full p-3 rounded-lg bg-cockpit-surface border border-cockpit-border hover:border-cockpit-border-strong transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-cockpit-bg flex items-center justify-center">
                    <PhoneCall size={16} className="text-cockpit-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cockpit-text-dim font-medium">Växel</p>
                    <p className="text-sm font-mono text-cockpit-text-secondary">{contact.switchboard}</p>
                  </div>
                  <kbd>V</kbd>
                </a>
              )}

              {contact.email && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-cockpit-bg border border-cockpit-border">
                  <Mail size={14} className="text-cockpit-text-dim flex-shrink-0" />
                  <span className="text-xs text-cockpit-text-muted truncate flex-1 font-mono">{contact.email}</span>
                  <button
                    onClick={copyEmail}
                    className={`p-1.5 rounded transition-all cursor-pointer ${
                      copied ? "text-cockpit-success" : "text-cockpit-text-dim hover:text-cockpit-text"
                    }`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>

            {/* Status buttons */}
            <div className="p-4 border-b border-cockpit-border">
              <h4 className="text-xs font-semibold text-cockpit-text-muted uppercase tracking-wider mb-3">
                Resultat
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {statusActions.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = contact.status === s;
                  return (
                    <motion.button
                      key={s}
                      onClick={() => handleStatusClick(s)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        active
                          ? "shadow-card-active"
                          : "bg-cockpit-surface hover:bg-cockpit-surface-hover border-cockpit-border hover:border-cockpit-border-strong"
                      }`}
                      style={{
                        color: cfg.color,
                        backgroundColor: active ? cfg.bg : undefined,
                        borderColor: active ? `${cfg.color}30` : undefined,
                      }}
                      whileHover={{ scale: active ? 1 : 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: active ? `${cfg.color}20` : "var(--bg)" }}
                      >
                        <cfg.icon size={12} />
                      </div>
                      <span className="flex-1 text-left">{cfg.label}</span>
                      <kbd className="text-2xs">{cfg.key}</kbd>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="flex-1 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={12} className="text-cockpit-text-dim" />
                  <h4 className="text-xs font-semibold text-cockpit-text-muted uppercase tracking-wider">
                    Anteckningar
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-cockpit-bg">
                  <div className="w-1.5 h-1.5 rounded-full bg-cockpit-success animate-pulse-subtle" />
                  <span className="text-2xs text-cockpit-text-dim">Auto-sparas</span>
                </div>
              </div>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Skriv anteckningar här..."
                className="w-full h-28 p-3 rounded-lg bg-cockpit-bg border border-cockpit-border text-sm text-cockpit-text placeholder:text-cockpit-text-dim resize-none focus:border-cockpit-border-focus focus:shadow-ring transition-all"
              />
            </div>
          </motion.div>

          {/* RIGHT: Research Panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-cockpit-bg">
            {/* Research tabs */}
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-cockpit-border">
              <div className="flex items-center bg-cockpit-surface rounded-lg p-1 border border-cockpit-border">
                <button
                  onClick={() => { setResearchTab("website"); setIframeFailed(false); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    researchTab === "website"
                      ? "bg-cockpit-bg text-cockpit-text shadow-button"
                      : "text-cockpit-text-muted hover:text-cockpit-text"
                  }`}
                >
                  <Globe size={14} />
                  Hemsida
                </button>
                <button
                  onClick={() => setResearchTab("linkedin")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    researchTab === "linkedin"
                      ? "bg-cockpit-linkedin text-white shadow-button"
                      : "text-cockpit-text-muted hover:text-cockpit-text"
                  }`}
                >
                  <Linkedin size={14} />
                  LinkedIn
                </button>
              </div>

              <div className="ml-auto">
                {researchTab === "website" && websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-cockpit-text-muted hover:text-cockpit-text hover:bg-cockpit-surface-hover transition-all"
                  >
                    <ExternalLink size={12} />
                    Öppna i ny flik
                  </a>
                )}
                {researchTab === "linkedin" && (
                  <a
                    href={linkedinUrl || linkedinSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-cockpit-text-muted hover:text-cockpit-text hover:bg-cockpit-surface-hover transition-all"
                  >
                    <ExternalLink size={12} />
                    Öppna i ny flik
                  </a>
                )}
              </div>
            </div>

            {/* Research content */}
            <div className="flex-1 m-4 rounded-lg border border-cockpit-border overflow-hidden bg-cockpit-surface shadow-card">
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
                    <div className="w-14 h-14 rounded-xl bg-cockpit-bg flex items-center justify-center mb-4">
                      <Globe size={24} className="text-cockpit-text-dim" />
                    </div>
                    {websiteUrl ? (
                      <>
                        <p className="text-sm font-medium text-cockpit-text mb-1">Hemsidan blockerar inbäddning</p>
                        <p className="text-xs text-cockpit-text-muted mb-6">Öppna istället i en ny flik.</p>
                        <a
                          href={websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                        >
                          <ExternalLink size={14} />
                          Öppna {new URL(websiteUrl).hostname}
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-cockpit-text mb-1">Ingen hemsida angiven</p>
                        <p className="text-xs text-cockpit-text-muted mb-6">Kontakten saknar URL i datasetet.</p>
                        {contact.company && (
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(contact.company)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary"
                          >
                            <Search size={14} />
                            Sök &quot;{contact.company}&quot;
                          </a>
                        )}
                      </>
                    )}
                  </div>
                )
              ) : (
                <div className="h-full flex flex-col overflow-hidden">
                  {/* LinkedIn profile card */}
                  <div className="p-6 border-b border-cockpit-border bg-cockpit-linkedin-bg">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-xl bg-cockpit-linkedin/20 border border-cockpit-linkedin/30 flex items-center justify-center flex-shrink-0">
                        <Linkedin size={28} className="text-cockpit-linkedin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-cockpit-text">{contact.name}</h3>
                        {contact.role && (
                          <p className="text-sm text-cockpit-text-muted mt-0.5">{contact.role}</p>
                        )}
                        {contact.company && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-cockpit-linkedin">
                            <Building2 size={12} />
                            <span>{contact.company}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* LinkedIn actions */}
                  <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <h4 className="text-2xs font-semibold text-cockpit-text-muted uppercase tracking-wider mb-3">
                      Snabbåtgärder
                    </h4>

                    {linkedinUrl ? (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full p-3 rounded-lg bg-cockpit-linkedin text-white hover:brightness-110 transition-all"
                      >
                        <Linkedin size={16} />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">Öppna profil</p>
                        </div>
                        <ExternalLink size={14} className="opacity-60" />
                      </a>
                    ) : (
                      <a
                        href={linkedinSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full p-3 rounded-lg bg-cockpit-linkedin text-white hover:brightness-110 transition-all"
                      >
                        <Search size={16} />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">Sök på LinkedIn</p>
                          <p className="text-xs opacity-70">&quot;{contact.name}{cleanCompany ? ` AND ${cleanCompany}` : ""}&quot;</p>
                        </div>
                        <ExternalLink size={14} className="opacity-60" />
                      </a>
                    )}

                    {contact.company && (
                      <a
                        href={`https://www.linkedin.com/company/${encodeURIComponent(cleanCompany.toLowerCase().replace(/\s+/g, "-").replace(/[åä]/g, "a").replace(/ö/g, "o"))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full p-3 rounded-lg border border-cockpit-border bg-cockpit-surface hover:bg-cockpit-surface-hover hover:border-cockpit-border-strong transition-all"
                      >
                        <Building2 size={16} className="text-cockpit-text-muted" />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-cockpit-text">Företagssida</p>
                          <p className="text-xs text-cockpit-text-muted">{contact.company}</p>
                        </div>
                        <ExternalLink size={12} className="text-cockpit-text-dim" />
                      </a>
                    )}

                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`"${contact.name}" "${cleanCompany}" site:linkedin.com`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 w-full p-3 rounded-lg border border-cockpit-border bg-cockpit-surface hover:bg-cockpit-surface-hover hover:border-cockpit-border-strong transition-all"
                    >
                      <Globe size={16} className="text-cockpit-text-muted" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-cockpit-text">Google → LinkedIn</p>
                        <p className="text-xs text-cockpit-text-muted">Sök via Google</p>
                      </div>
                      <ExternalLink size={12} className="text-cockpit-text-dim" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
