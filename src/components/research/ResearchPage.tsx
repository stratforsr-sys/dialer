"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, AlertCircle, RefreshCw, ChevronRight,
  Building2, Globe, Hash, User, Briefcase, Clock, CheckCircle2,
  TrendingUp, MessageSquare, Zap, Shield
} from "lucide-react";
import { useResearch } from "@/hooks/useResearch";
import type { BattleCard, ProgressiveMode, ResearchRequest } from "@/types/research";
import { ConfidenceBadge } from "./ConfidenceBadge";

// ─── Recent searches ─────────────────────────────────────────────────────────

const RECENTS_KEY = "research_recents";

function getRecents(): ResearchRequest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addRecent(req: ResearchRequest) {
  const existing = getRecents().filter((r) => r.company_name !== req.company_name);
  const updated = [req, ...existing].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
}

// ─── Section helper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-[14px] p-5 border space-y-3"
      style={{
        background: "var(--surface)",
        borderColor: accent ? `${accent}22` : "var(--border)",
        borderLeftWidth: accent ? 3 : 1,
        borderLeftColor: accent ?? "var(--border)",
      }}
    >
      <div className="flex items-center gap-2" style={{ color: accent ?? "var(--text-muted)" }}>
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Battle card sections ─────────────────────────────────────────────────────

function CardCore({ card }: { card: BattleCard }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div
        className="rounded-[12px] p-4 space-y-1 border"
        style={{ background: "var(--surface-inset)", borderColor: "var(--border)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          En mening
        </p>
        <p className="text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>
          {card.stripped.one_sentence}
        </p>
      </div>
      <div
        className="rounded-[12px] p-4 space-y-1 border"
        style={{ background: "var(--surface-inset)", borderColor: "var(--border)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Nyckelsiffra
        </p>
        <p className="text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>
          {card.stripped.one_number}
        </p>
      </div>
      <div
        className="rounded-[12px] p-4 space-y-1 border"
        style={{ background: "var(--surface-inset)", borderColor: "var(--border)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Öppningsfråga
        </p>
        <p className="text-sm font-medium leading-snug italic" style={{ color: "var(--text)" }}>
          &ldquo;{card.stripped.one_question}&rdquo;
        </p>
      </div>
    </div>
  );
}

function CardIngång({ card }: { card: BattleCard }) {
  return (
    <Section title="30-sekunders ingång" icon={<MessageSquare size={14} />} accent="var(--success)">
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {card.hook}
      </p>
    </Section>
  );
}

function CardGap({ card }: { card: BattleCard }) {
  return (
    <Section title="Problemet vi löser" icon={<AlertCircle size={14} />} accent="var(--warning)">
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {card.gap}
      </p>
    </Section>
  );
}

function CardMath({ card }: { card: BattleCard }) {
  if (!card.math) return null;
  return (
    <Section title="Kalkylen" icon={<TrendingUp size={14} />}>
      <p
        className="text-sm leading-relaxed"
        style={{
          fontFamily: "var(--font-mono)",
          background: "var(--surface-inset)",
          padding: "12px 14px",
          borderRadius: 8,
          color: "var(--text)",
        }}
      >
        {card.math}
      </p>
    </Section>
  );
}

function CardKillers({ card }: { card: BattleCard }) {
  if (!card.killers?.length) return null;
  const icons = {
    "auto-doc": <Zap size={13} />,
    "pattern-recognition": <TrendingUp size={13} />,
    "just-ask": <Shield size={13} />,
  };
  return (
    <Section title="Rätt funktion att pitcha" icon={<Zap size={14} />} accent="var(--info)">
      <div className="space-y-2">
        {card.killers.map((k, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-[10px] border"
            style={{ background: "var(--surface-inset)", borderColor: "var(--border)" }}
          >
            <span style={{ color: "var(--text-muted)", marginTop: 1 }}>
              {icons[k.feature]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{k.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{k.reason}</p>
            </div>
            <ConfidenceBadge tier={k.confidence} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function CardBullets({ card }: { card: BattleCard }) {
  if (!card.bullets?.length) return null;
  return (
    <Section title="5 snabbfakta" icon={<CheckCircle2 size={14} />}>
      <ul className="space-y-2">
        {card.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--success)", marginTop: 2, flexShrink: 0 }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CardObjections({ card }: { card: BattleCard }) {
  if (!card.objection_prep?.length) return null;
  return (
    <Section title="Invändningar & svar" icon={<MessageSquare size={14} />} accent="var(--danger)">
      <div className="space-y-4">
        {card.objection_prep.map((o, i) => (
          <div key={i} className="space-y-1">
            <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
              &ldquo;{o.objection}&rdquo;
            </p>
            <p
              className="text-xs pl-3 leading-relaxed"
              style={{
                color: "var(--text-secondary)",
                borderLeft: "2px solid var(--border-strong)",
              }}
            >
              {o.response}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Full results ─────────────────────────────────────────────────────────────

function ResearchResults({
  card,
  mode,
  companyName,
  onRefresh,
}: {
  card: BattleCard;
  mode: ProgressiveMode;
  companyName: string;
  onRefresh: () => void;
}) {
  const modeLabel: Record<ProgressiveMode, string> = {
    full: "Fullständig analys",
    bullets: "Snabbvy",
    minimal: "Kompaktvy",
    stripped: "Nödvy",
  };

  const freshColor = card.data_freshness === "fresh"
    ? "var(--success)"
    : card.data_freshness === "aging"
    ? "var(--warning)"
    : "var(--danger)";

  return (
    <div className="space-y-5">
      {/* Result header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            {companyName}
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{modeLabel[mode]}</span>
            <span className="text-xs" style={{ color: freshColor }}>
              {card.data_freshness === "fresh" ? "● Färsk data" : card.data_freshness === "aging" ? "● Åldrande data" : "● Inaktuell data"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              {new Date(card.generated_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw size={13} />
          Uppdatera
        </button>
      </div>

      {/* Confidence summary */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-[10px] border text-xs" style={{ background: "var(--surface-inset)", borderColor: "var(--border)" }}>
        <span style={{ color: "var(--text-muted)" }}>Konfidenssammanfattning:</span>
        <span style={{ color: "var(--success)" }}>✓ {card.confidence_summary.verified_count} verifierade</span>
        <span style={{ color: "var(--warning)" }}>~ {card.confidence_summary.inferred_count} härledda</span>
        <span style={{ color: "var(--text-dim)" }}>? {card.confidence_summary.estimated_count} uppskattade</span>
      </div>

      {/* Core 3-column */}
      <CardCore card={card} />

      {/* Ingång */}
      {card.hook && <CardIngång card={card} />}

      {/* Gap + Math side by side if both present */}
      {card.gap && card.math ? (
        <div className="grid grid-cols-2 gap-4">
          <CardGap card={card} />
          <CardMath card={card} />
        </div>
      ) : (
        <>
          {card.gap && <CardGap card={card} />}
          {card.math && <CardMath card={card} />}
        </>
      )}

      {/* Killers */}
      <CardKillers card={card} />

      {/* Bullets */}
      {(mode === "bullets" || mode === "full") && <CardBullets card={card} />}

      {/* Objections */}
      {mode === "full" && <CardObjections card={card} />}
    </div>
  );
}

// ─── Search form ──────────────────────────────────────────────────────────────

function SearchForm({ onSearch }: { onSearch: (req: ResearchRequest) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [recents] = useState<ResearchRequest[]>(() => getRecents());

  const canSubmit = companyName.trim().length > 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const req: ResearchRequest = {
      company_name: companyName.trim(),
      org_number: orgNumber.trim() || undefined,
      website: website.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_title: contactTitle.trim() || undefined,
    };
    addRecent(req);
    onSearch(req);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Primary: Company name */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Företagsnamn *
          </label>
          <div className="relative">
            <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="t.ex. Techgruppen AB"
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-[10px] border outline-none transition-all"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border-strong)",
                color: "var(--text)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            />
          </div>
        </div>

        {/* Secondary row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Org.nummer
            </label>
            <div className="relative">
              <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
              <input
                type="text"
                value={orgNumber}
                onChange={(e) => setOrgNumber(e.target.value)}
                placeholder="556123-4567"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-[10px] border outline-none transition-all"
                style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Hemsida
            </label>
            <div className="relative">
              <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="techgruppen.se"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-[10px] border outline-none transition-all"
                style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>
          </div>
        </div>

        {/* Contact row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Kontaktperson
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Johan Lindgren"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-[10px] border outline-none transition-all"
                style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Roll / titel
            </label>
            <div className="relative">
              <Briefcase size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} />
              <input
                type="text"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                placeholder="VD, IT-chef..."
                className="w-full pl-8 pr-3 py-2 text-sm rounded-[10px] border outline-none transition-all"
                style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary w-full flex items-center justify-center gap-2"
          style={{ opacity: canSubmit ? 1 : 0.45 }}
        >
          <Search size={14} />
          Analysera företag
        </button>
      </form>

      {/* Recent searches */}
      {recents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--text-dim)" }}>
            <Clock size={11} />
            <span>Senaste sökningar</span>
          </div>
          <div className="space-y-1">
            {recents.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  addRecent(r);
                  onSearch(r);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-all duration-100"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Building2 size={13} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                    {r.company_name}
                  </p>
                  {r.contact_name && (
                    <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>
                      {r.contact_name}{r.contact_title ? ` · ${r.contact_title}` : ""}
                    </p>
                  )}
                </div>
                <ChevronRight size={13} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export function ResearchPage() {
  const { job, loading, error, startResearch, progressiveMode } = useResearch();
  const [activeRequest, setActiveRequest] = useState<ResearchRequest | null>(null);

  const handleSearch = useCallback(
    (req: ResearchRequest) => {
      setActiveRequest(req);
      startResearch(req);
    },
    [startResearch]
  );

  const handleRefresh = useCallback(() => {
    if (activeRequest) startResearch(activeRequest);
  }, [activeRequest, startResearch]);

  const showResults = job?.status === "complete" && job.card;
  const showLoading = loading;
  const showEmpty = !loading && !job;
  const showError = !!error && !loading;

  return (
    <div className="h-full flex" style={{ background: "var(--bg)" }}>
      {/* Left sidebar: search + recents */}
      <div
        className="w-80 shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5 mb-1">
            <Search size={16} style={{ color: "var(--text-muted)" }} />
            <h1
              className="text-base font-bold"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
            >
              Sales Research
            </h1>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Battle cards för Techgruppen IT
          </p>
        </div>

        <div className="p-5 flex-1">
          <SearchForm onSearch={handleSearch} />
        </div>
      </div>

      {/* Right: results area */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {showLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center h-full gap-4"
            >
              <div className="relative">
                <div
                  className="w-14 h-14 rounded-[16px] flex items-center justify-center"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {activeRequest?.company_name ?? "Analyserar..."}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {job?.status_detail ?? "Hämtar data..."}
                </p>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {showError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full gap-4"
            >
              <div
                className="w-14 h-14 rounded-[16px] flex items-center justify-center"
                style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
              >
                <AlertCircle size={22} style={{ color: "var(--danger)" }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Research misslyckades</p>
                <p className="text-xs max-w-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
              </div>
              <button onClick={handleRefresh} className="btn-secondary text-xs flex items-center gap-1.5">
                <RefreshCw size={12} /> Försök igen
              </button>
            </motion.div>
          )}

          {/* Results */}
          {showResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="p-6"
            >
              <ResearchResults
                card={job!.card!}
                mode={progressiveMode}
                companyName={activeRequest?.company_name ?? job!.card!.company_name}
                onRefresh={handleRefresh}
              />
            </motion.div>
          )}

          {/* Empty */}
          {showEmpty && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4"
            >
              <div
                className="w-16 h-16 rounded-[20px] flex items-center justify-center"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <Search size={24} style={{ color: "var(--text-dim)" }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Sök ett företag för att börja
                </p>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Battle card, invändningshantering & ingångar
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
