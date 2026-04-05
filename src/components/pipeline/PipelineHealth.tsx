"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

type Stage = {
  id: string;
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
};

type Lead = {
  id: string;
  companyName: string;
  stageId: string;
  stage: Stage;
  owner: { id: string; name: string };
  _count: { contacts: number };
  activities: { type: string; timestamp: Date }[];
  updatedAt: Date;
};

// ─── Health score calculation ─────────────────────────────────────────────────
function getHealth(lead: Lead): { score: number; color: string; label: string; icon: React.ReactNode } {
  const now = Date.now();
  const lastActivity = lead.activities[0]?.timestamp
    ? new Date(lead.activities[0].timestamp).getTime()
    : new Date(lead.updatedAt).getTime();

  const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);

  if (daysSinceActivity < 7) {
    const score = Math.max(85, 100 - daysSinceActivity * 2);
    return { score, color: "#22c55e", label: "Aktiv", icon: <CheckCircle2 size={11} /> };
  }
  if (daysSinceActivity < 14) {
    const score = 60 - (daysSinceActivity - 7) * 4;
    return { score, color: "#f59e0b", label: "Varnande", icon: <Clock size={11} /> };
  }
  const score = Math.max(10, 40 - (daysSinceActivity - 14) * 2);
  return { score, color: "#ef4444", label: "Stagnerad", icon: <AlertTriangle size={11} /> };
}

// ─── Lead card ────────────────────────────────────────────────────────────────
function HealthCard({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { score, color, label, icon } = getHealth(lead);
  const lastAct = lead.activities[0]?.timestamp;
  const daysAgo = lastAct
    ? Math.round((Date.now() - new Date(lastAct).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={() => router.push(`/leads/${lead.id}`)}
      className="cursor-pointer p-3 rounded-[14px] transition-all"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
            {lead.companyName}
          </p>
          <p className="text-[10px] mt-[1px]" style={{ color: "var(--text-dim)" }}>
            {lead.owner.name} · {lead._count.contacts} kontakt{lead._count.contacts !== 1 ? "er" : ""}
          </p>
        </div>
        <div
          className="flex items-center gap-[3px] text-[9px] font-medium px-[6px] py-[2px] rounded-full shrink-0 ml-2"
          style={{ background: color + "15", color }}
        >
          {icon}
          <span>{label}</span>
        </div>
      </div>

      {/* Health bar */}
      <div className="health-bar">
        <motion.div
          className="health-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          style={{ background: color }}
        />
      </div>

      {daysAgo !== null && (
        <p className="text-[9px] mt-[5px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {daysAgo === 0 ? "Aktivitet idag" : `Senaste aktivitet: ${daysAgo}d sedan`}
        </p>
      )}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PipelineHealth({ stages, leads }: { stages: Stage[]; leads: Lead[] }) {
  const activeStages = stages.filter((s) => !s.isWon && !s.isLost);

  // Summary stats
  const total = leads.length;
  const atRisk = leads.filter((l) => {
    const { color } = getHealth(l);
    return color === "#ef4444";
  }).length;
  const warning = leads.filter((l) => {
    const { color } = getHealth(l);
    return color === "#f59e0b";
  }).length;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Summary bar */}
      <div
        className="flex items-center gap-6 px-6 py-3 border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Total pipeline</span>
          <span className="text-[13px] font-semibold" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{total}</span>
        </div>
        <div className="w-[1px] h-4" style={{ background: "var(--border)" }} />
        {atRisk > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle size={12} style={{ color: "#ef4444" }} />
            <span className="text-[12px]" style={{ color: "#ef4444" }}>{atRisk} stagnerade</span>
          </div>
        )}
        {warning > 0 && (
          <div className="flex items-center gap-1">
            <Clock size={12} style={{ color: "#f59e0b" }} />
            <span className="text-[12px]" style={{ color: "#f59e0b" }}>{warning} varnar</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#22c55e" }} /> Aktiv &lt;7d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f59e0b" }} /> Varnande 7–14d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#ef4444" }} /> Stagnerad &gt;14d</span>
        </div>
      </div>

      {/* Stage columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-0 h-full" style={{ minWidth: `${activeStages.length * 280}px` }}>
          {activeStages.map((stage) => {
            const stageLeads = leads.filter((l) => l.stageId === stage.id);
            return (
              <div
                key={stage.id}
                className="flex flex-col border-r"
                style={{ width: "280px", flexShrink: 0, borderColor: "var(--border)" }}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{stage.name}</span>
                  </div>
                  <span
                    className="text-[11px] px-[6px] py-[2px] rounded-full font-medium"
                    style={{ background: "var(--surface-inset)", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                  >
                    {stageLeads.length}
                  </span>
                </div>

                {/* Lead cards */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                  {stageLeads.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-[12px]" style={{ color: "var(--text-dim)" }}>Inga leads</p>
                    </div>
                  ) : (
                    stageLeads.map((lead, i) => (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <HealthCard lead={lead} />
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
