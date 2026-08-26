"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, MessageSquare, Loader2, Globe, FolderOpen } from "lucide-react";
import {
  createScriptTemplate,
  setTemplateList,
  getSampleLeadForList,
} from "@/app/actions/scripts";
import { ScriptEditor, type EditableVariant } from "@/components/scripts/ScriptEditor";
import { parseRequiredKeys } from "@/lib/script-resolver";
import { FRAMEWORK_STEPS } from "@/lib/cockpit-flow";
import type { FrameworkStep } from "@/generated/prisma/client";

type Template = {
  id: string;
  name: string;
  step: FrameworkStep;
  active: boolean;
  listId: string | null;
  list: { id: string; name: string } | null;
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

type ListOption = {
  id: string;
  name: string;
  archived: boolean;
  scriptCount: number;
  leadCount: number;
};

/** Sidomenyns grupper: det allmänna först, sedan en rubrik per mapp. */
type Group = { key: string; name: string; listId: string | null; templates: Template[] };

function groupTemplates(templates: Template[], lists: ListOption[]): Group[] {
  const general = templates.filter((t) => t.listId === null);
  const groups: Group[] = [
    { key: "__general__", name: "Alla mappar", listId: null, templates: general },
  ];

  for (const list of lists) {
    const own = templates.filter((t) => t.listId === list.id);
    if (own.length > 0) {
      groups.push({ key: list.id, name: list.name, listId: list.id, templates: own });
    }
  }
  return groups;
}

export function ScriptsView({
  templates,
  lists,
  claimKeys,
  sampleLeadId,
  sampleLeadName,
}: {
  templates: Template[];
  lists: ListOption[];
  claimKeys: Array<{ key: string; count: number }>;
  sampleLeadId: string | null;
  sampleLeadName: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(templates[0]?.id ?? null);
  const [creating, startCreating] = useTransition();
  const [moving, startMoving] = useTransition();
  const [newStep, setNewStep] = useState<FrameworkStep>("INTRO");
  const [newListId, setNewListId] = useState<string>("");

  const template = templates.find((t) => t.id === selected) ?? null;
  const version = template?.versions[0] ?? null;

  // Ett mappmanus förhandsgranskas mot ett bolag UR mappen. Underlaget avgör
  // vilken variant som vinner, så ett lead ur en annan lista visar fel rad —
  // och just den kontrollen är hela poängen med förhandsgranskningen.
  const [listSample, setListSample] = useState<{ id: string; companyName: string } | null>(null);
  const scopeListId = template?.listId ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!scopeListId) {
      setListSample(null);
      return;
    }
    void getSampleLeadForList(scopeListId).then((lead) => {
      if (!cancelled) setListSample(lead);
    });
    return () => {
      cancelled = true;
    };
  }, [scopeListId]);

  // Mappen har manus men inga leads kvar — då är det allmänna exemplet bättre
  // än ingen förhandsgranskning alls.
  const effectiveSampleId = scopeListId ? listSample?.id ?? sampleLeadId : sampleLeadId;
  const effectiveSampleName = scopeListId ? listSample?.companyName ?? sampleLeadName : sampleLeadName;

  const initialVariants: EditableVariant[] =
    version?.variants.map((v) => ({
      label: v.label,
      priority: v.priority,
      body: v.body,
      requiredKeys: parseRequiredKeys(v.requiredKeysJson),
      minConfidence: v.minConfidence,
    })) ?? [];

  const groups = groupTemplates(templates, lists);

  function create() {
    const stepLabel = FRAMEWORK_STEPS.find((s) => s.value === newStep)?.label ?? newStep;
    const listName = lists.find((l) => l.id === newListId)?.name;
    // Namnet bär mappen. Utan det heter fem manus "Intro" i listan och det går
    // inte att se vilket som gäller var.
    const name = listName ? `${stepLabel} — ${listName}` : stepLabel;
    startCreating(async () => {
      const t = await createScriptTemplate(name, newStep, newListId || null);
      setSelected(t.id);
      window.location.reload();
    });
  }

  function move(listId: string | null) {
    if (!template) return;
    startMoving(async () => {
      await setTemplateList(template.id, listId);
      window.location.reload();
    });
  }

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-[26px] mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
          Manus
        </h1>
        <p className="text-[13px] max-w-[720px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Du skriver manuset, inte en språkmodell. Varje steg kan ha flera varianter i
          prioritetsordning — den första vars datakrav är uppfyllda visas för säljaren.
          Sista varianten bör sakna krav, så att ett lead utan underlag ändå får något att säga.
        </p>
        <p className="text-[13px] max-w-[720px] leading-relaxed mt-2" style={{ color: "var(--text-muted)" }}>
          Ett manus kan knytas till en enskild ringlista. Då <strong>ersätter</strong> det det
          allmänna manuset för sitt steg när säljaren ringer i den mappen — övriga steg faller
          tillbaka på det allmänna, så en kampanj behöver bara skriva om det som skiljer sig.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Steglista */}
        <div className="w-[230px] shrink-0">
          <div className="flex flex-col gap-3 mb-4">
            {templates.length === 0 && (
              <p className="text-[12px] px-3 py-3 rounded-md"
                style={{ background: "var(--surface-inset)", color: "var(--text-dim)", border: "1px dashed var(--border-strong)" }}>
                Inga manus än. Skapa ett för intro-steget så syns det i cockpit direkt när det publicerats.
              </p>
            )}

            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  {group.listId === null
                    ? <Globe size={10} style={{ color: "var(--text-dim)" }} />
                    : <FolderOpen size={10} style={{ color: "var(--accent)" }} />}
                  <p className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: "var(--text-dim)" }}>
                    {group.name}
                  </p>
                </div>

                {group.templates.length === 0 && (
                  <p className="text-[11px] px-3 py-2" style={{ color: "var(--text-dim)" }}>
                    Inget allmänt manus
                  </p>
                )}

                <div className="flex flex-col gap-1">
                  {group.templates.map((t) => {
                    const stepLabel = FRAMEWORK_STEPS.find((s) => s.value === t.step)?.label ?? t.step;
                    const published = t.versions.some((v) => v.publishedAt);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-left transition-all"
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
              </div>
            ))}
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
              Nytt manus
            </p>
            <select
              value={newStep}
              onChange={(e) => setNewStep(e.target.value as FrameworkStep)}
              className="w-full px-2 py-1.5 text-[12px] rounded-md outline-none mb-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              {FRAMEWORK_STEPS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={newListId}
              onChange={(e) => setNewListId(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] rounded-md outline-none mb-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              <option value="">Alla mappar</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.archived ? " (arkiverad)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={create}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-[12px] font-semibold rounded-md"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Skapa
            </button>
          </div>

          {effectiveSampleName && (
            <p className="text-[10px] mt-3 px-1" style={{ color: "var(--text-dim)" }}>
              Förhandsgranskas mot {effectiveSampleName}
            </p>
          )}
        </div>

        {/* Redigerare */}
        <div className="flex-1 min-w-0">
          {template && version ? (
            <>
              {/* Vem manuset gäller. Ligger ovanför texten och inte i en
                  inställningsruta någon annanstans: räckvidden är minst lika
                  avgörande som orden, och den ska synas medan man skriver dem. */}
              <div
                className="flex items-center gap-3 flex-wrap px-4 py-3 mb-3 rounded-lg"
                style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                  Gäller
                </span>
                <select
                  value={template.listId ?? ""}
                  disabled={moving}
                  onChange={(e) => move(e.target.value || null)}
                  className="px-2 py-1.5 text-[12px] rounded-md outline-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                >
                  <option value="">Alla mappar</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.archived ? " (arkiverad)" : ""}
                    </option>
                  ))}
                </select>
                {moving && <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-dim)" }} />}
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {template.listId
                    ? `Ersätter det allmänna ${(FRAMEWORK_STEPS.find((s) => s.value === template.step)?.label ?? template.step).toLowerCase()}-manuset för säljare som ringer i mappen.`
                    : "Används i alla mappar som inte har ett eget manus för steget."}
                </p>
              </div>

              {/* Nyckeln bär bara versionen. Läggs exempelleadet till i den
                  monteras redigeraren om när mappens lead hämtats klart, och det
                  som hunnit skrivas försvinner. ScriptEditor granskar om av sig
                  själv när sampleLeadId byter värde. */}
              <ScriptEditor
                key={version.id}
                versionId={version.id}
                versionNumber={version.version}
                published={version.publishedAt !== null}
                templateId={template.id}
                initialVariants={initialVariants}
                claimKeys={claimKeys}
                sampleLeadId={effectiveSampleId}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-[300px] rounded-lg"
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
