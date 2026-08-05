"use client";

import { useState, useTransition } from "react";
import { Plus, MessageSquare, Loader2 } from "lucide-react";
import { createScriptTemplate } from "@/app/actions/scripts";
import { ScriptEditor, type EditableVariant } from "@/components/scripts/ScriptEditor";
import { parseRequiredKeys } from "@/lib/script-resolver";
import { FRAMEWORK_STEPS } from "@/lib/cockpit-flow";
import type { FrameworkStep } from "@/generated/prisma/client";

type Template = {
  id: string;
  name: string;
  step: FrameworkStep;
  active: boolean;
  versions: Array<{
    id: string;
    version: number;
    publishedAt: Date | null;
    variants: Array<{
      id: string;
      label: string;
      priority: number;
      body: string;
      requiredKeysJson: string;
      minConfidence: number;
    }>;
  }>;
};

export function ScriptsView({
  templates,
  claimKeys,
  sampleLeadId,
  sampleLeadName,
}: {
  templates: Template[];
  claimKeys: Array<{ key: string; count: number }>;
  sampleLeadId: string | null;
  sampleLeadName: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(templates[0]?.id ?? null);
  const [creating, startCreating] = useTransition();
  const [newStep, setNewStep] = useState<FrameworkStep>("INTRO");

  const template = templates.find((t) => t.id === selected) ?? null;
  const version = template?.versions[0] ?? null;

  const initialVariants: EditableVariant[] =
    version?.variants.map((v) => ({
      label: v.label,
      priority: v.priority,
      body: v.body,
      requiredKeys: parseRequiredKeys(v.requiredKeysJson),
      minConfidence: v.minConfidence,
    })) ?? [];

  function create() {
    const stepLabel = FRAMEWORK_STEPS.find((s) => s.value === newStep)?.label ?? newStep;
    startCreating(async () => {
      const t = await createScriptTemplate(stepLabel, newStep);
      setSelected(t.id);
      window.location.reload();
    });
  }

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-[26px] mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
          Manus
        </h1>
        <p className="text-[13px] max-w-[720px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Du skriver manuset, inte en språkmodell. Varje steg kan ha flera varianter i
          prioritetsordning — den första vars datakrav är uppfyllda visas för säljaren.
          Sista varianten bör sakna krav, så att ett lead utan underlag ändå får något att säga.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Steglista */}
        <div className="w-[210px] shrink-0">
          <div className="flex flex-col gap-1 mb-4">
            {templates.length === 0 && (
              <p className="text-[12px] px-3 py-3 rounded-[10px]"
                style={{ background: "var(--surface-inset)", color: "var(--text-dim)", border: "1px dashed var(--border-strong)" }}>
                Inga manus än. Skapa ett för intro-steget så syns det i cockpit direkt när det publicerats.
              </p>
            )}
            {templates.map((t) => {
              const stepLabel = FRAMEWORK_STEPS.find((s) => s.value === t.step)?.label ?? t.step;
              const published = t.versions.some((v) => v.publishedAt);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-left transition-all"
                  style={{
                    background: selected === t.id ? "var(--accent-muted)" : "transparent",
                    border: `1px solid ${selected === t.id ? "var(--border-strong)" : "transparent"}`,
                  }}
                >
                  <MessageSquare size={13} style={{ color: selected === t.id ? "var(--accent)" : "var(--text-dim)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
                      {t.name}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      {stepLabel} · {published ? "publicerat" : "utkast"}
                      {!t.active && " · inaktivt"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-[12px] p-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
              Nytt manus
            </p>
            <select
              value={newStep}
              onChange={(e) => setNewStep(e.target.value as FrameworkStep)}
              className="w-full px-2 py-1.5 text-[12px] rounded-[8px] outline-none mb-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              {FRAMEWORK_STEPS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={create}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-[12px] font-semibold rounded-[8px]"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Skapa
            </button>
          </div>

          {sampleLeadName && (
            <p className="text-[10px] mt-3 px-1" style={{ color: "var(--text-dim)" }}>
              Förhandsgranskas mot {sampleLeadName}
            </p>
          )}
        </div>

        {/* Redigerare */}
        <div className="flex-1 min-w-0">
          {template && version ? (
            <ScriptEditor
              key={version.id}
              versionId={version.id}
              versionNumber={version.version}
              published={version.publishedAt !== null}
              templateId={template.id}
              initialVariants={initialVariants}
              claimKeys={claimKeys}
              sampleLeadId={sampleLeadId}
            />
          ) : (
            <div className="flex items-center justify-center h-[300px] rounded-[14px]"
              style={{ background: "var(--surface-inset)", border: "1px dashed var(--border-strong)" }}>
              <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
                Välj eller skapa ett manus
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
