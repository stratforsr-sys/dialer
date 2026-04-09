"use client";

import { useEffect } from "react";
import {
  Search, Loader2, AlertCircle, Zap, TrendingUp, Database,
  MessageSquare, ChevronDown, CheckCircle2, X
} from "lucide-react";
import type { Contact } from "@/types";
import type { BattleCard, ProgressiveMode } from "@/types/research";
import { useResearch } from "@/hooks/useResearch";
import { ConfidenceBadge } from "./ConfidenceBadge";

const FEATURE_ICONS = {
  "auto-doc": <Zap size={14} />,
  "pattern-recognition": <TrendingUp size={14} />,
  "just-ask": <Database size={14} />,
};

// ─── Stripped view (<10 min to meeting) ───────────────────────────────────────
function StrippedCard({ card }: { card: BattleCard }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">En mening</p>
        <p className="text-sm text-blue-900 font-medium">{card.stripped.one_sentence}</p>
      </div>
      <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
        <p className="text-xs text-green-500 font-semibold uppercase tracking-wide mb-1">Siffran</p>
        <p className="text-sm text-green-900 font-medium">{card.stripped.one_number}</p>
      </div>
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
        <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide mb-1">Oppna med</p>
        <p className="text-sm text-purple-900 font-semibold italic">&ldquo;{card.stripped.one_question}&rdquo;</p>
      </div>
    </div>
  );
}

// ─── Bullets view (2–48h to meeting) ──────────────────────────────────────────
function BulletsCard({ card }: { card: BattleCard }) {
  return (
    <div className="space-y-4">
      <StrippedCard card={card} />

      {card.hook && (
        <Section title="Isbrytare" icon={<MessageSquare size={14} />}>
          <p className="text-sm text-zinc-700">{card.hook}</p>
        </Section>
      )}

      {card.math && (
        <Section title="Kalkylen" icon={<TrendingUp size={14} />}>
          <p className="text-sm font-mono text-zinc-800 bg-zinc-50 p-3 rounded-lg">{card.math}</p>
        </Section>
      )}

      {card.killers?.length > 0 && (
        <Section title="Rätt funktion" icon={<Zap size={14} />}>
          <div className="space-y-2">
            {card.killers.map((k, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-zinc-50 rounded-lg">
                <span className="text-zinc-400 mt-0.5">{FEATURE_ICONS[k.feature]}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-zinc-800">{k.label}</span>
                  <p className="text-xs text-zinc-600 mt-0.5">{k.reason}</p>
                </div>
                <ConfidenceBadge tier={k.confidence} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {card.bullets?.length > 0 && (
        <Section title="5 snabbfakta" icon={<CheckCircle2 size={14} />}>
          <ul className="space-y-1.5">
            {card.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-700">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ─── Full card (>48h) ──────────────────────────────────────────────────────────
function FullCard({ card }: { card: BattleCard }) {
  return (
    <div className="space-y-4">
      <BulletsCard card={card} />

      {card.gap && (
        <Section title="Problemet" icon={<AlertCircle size={14} />}>
          <p className="text-sm text-zinc-700">{card.gap}</p>
        </Section>
      )}

      {card.objection_prep?.length > 0 && (
        <Section title="Invändningar" icon={<MessageSquare size={14} />}>
          <div className="space-y-3">
            {card.objection_prep.map((o, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-semibold text-red-600">&ldquo;{o.objection}&rdquo;</p>
                <p className="text-xs text-zinc-700 pl-3 border-l-2 border-zinc-200">{o.response}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span>Konfidenssammanfattning:</span>
        <span className="text-green-600">{card.confidence_summary.verified_count} verifierade</span>
        <span className="text-yellow-600">{card.confidence_summary.inferred_count} härledda</span>
        <span className="text-zinc-500">{card.confidence_summary.estimated_count} uppskattade</span>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
interface ResearchPanelProps {
  contact: Contact;
  onClose?: () => void;
  className?: string;
}

export function ResearchPanel({ contact, onClose, className }: ResearchPanelProps) {
  const { job, loading, error, startResearch, reset, progressiveMode } = useResearch();

  // Auto-start when contact changes
  useEffect(() => {
    if (contact.company) {
      startResearch({
        company_name: contact.company,
        org_number: contact.org_number || undefined,
        contact_name: contact.name || undefined,
        contact_title: contact.role || undefined,
        website: contact.website || undefined,
      });
    }
    return () => reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  const modeLabelMap: Record<ProgressiveMode, string> = {
    full: "Fullständig analys",
    bullets: "Snabbvy — möte om 2–48h",
    minimal: "Kompaktvy — möte inom 2h",
    stripped: "Nödvy — möte om under 10 min",
  };

  return (
    <div className={`flex flex-col h-full bg-white border-l border-zinc-200 ${className ?? "w-80 shrink-0"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-800">Sales Research</span>
        </div>
        <div className="flex items-center gap-2">
          {job?.status === "complete" && (
            <button
              onClick={() =>
                startResearch({
                  company_name: contact.company,
                  org_number: contact.org_number || undefined,
                  contact_name: contact.name || undefined,
                  contact_title: contact.role || undefined,
                  website: contact.website || undefined,
                })
              }
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Uppdatera
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Company header */}
      <div className="px-4 py-2 border-b border-zinc-100 bg-zinc-50">
        <p className="text-xs font-semibold text-zinc-800 truncate">{contact.company}</p>
        {job?.status === "complete" && (
          <p className="text-[10px] text-zinc-400">{modeLabelMap[progressiveMode]}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 size={20} className="text-blue-500 animate-spin" />
            <p className="text-xs text-zinc-500">{job?.status_detail ?? "Startar..."}</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle size={20} className="text-red-400" />
            <p className="text-xs text-red-600">{error}</p>
            <button
              onClick={() =>
                startResearch({
                  company_name: contact.company,
                  org_number: contact.org_number || undefined,
                  contact_name: contact.name || undefined,
                  contact_title: contact.role || undefined,
                  website: contact.website || undefined,
                })
              }
              className="text-xs text-blue-500 hover:underline"
            >
              Forsok igen
            </button>
          </div>
        )}

        {/* Battle card */}
        {job?.status === "complete" && job.card && (
          <>
            {progressiveMode === "stripped" && <StrippedCard card={job.card} />}
            {progressiveMode === "minimal" && <StrippedCard card={job.card} />}
            {progressiveMode === "bullets" && <BulletsCard card={job.card} />}
            {progressiveMode === "full" && <FullCard card={job.card} />}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && !job && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Search size={20} className="text-zinc-300" />
            <p className="text-xs text-zinc-400">Ingen research startad</p>
          </div>
        )}
      </div>
    </div>
  );
}
