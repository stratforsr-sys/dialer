"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Plus, MessageSquare, Loader2, Globe, FolderOpen, Archive, ArchiveRestore,
  Trash2, Copy, ArrowUp, ArrowDown, Power, PowerOff, Pencil, AlertTriangle, Check,
} from "lucide-react";
import {
  createScriptTemplate,
  setTemplateList,
  setTemplateActive,
  setTemplateArchived,
  deleteTemplate,
  duplicateTemplate,
  renameTemplate,
  moveTemplateOrder,
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
  archived: boolean;
  sortOrder: number;
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
  const live = templates.filter((t) => !t.archived);
  const groups: Group[] = [
    {
      key: "__general__",
      name: "Alla mappar",
      listId: null,
      templates: live.filter((t) => t.listId === null),
    },
  ];

  for (const list of lists) {
    const own = live.filter((t) => t.listId === list.id);
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Markeringen bor i URL:en, inte i state.
  //
  // Varje åtgärd i den här vyn slutade tidigare med `window.location.reload()`,
  // och efter omladdningen sattes markeringen om till `templates[0].id` —
  // alltså alltid FÖRSTA manuset i listan, aldrig det man höll på med. "Nytt
  // utkast", "Publicera", "Skapa" och byte av mapp hoppade därför alla till fel
  // manus. Nu skriver åtgärderna i stället `router.refresh()`, som hämtar ny
  // serverdata utan att kasta klientens tillstånd, och markeringen överlever
  // både det och en riktig omladdning.
  const live = useMemo(() => templates.filter((t) => !t.archived), [templates]);
  const archived = useMemo(() => templates.filter((t) => t.archived), [templates]);

  const selected =
    templates.find((t) => t.id === params.get("manus"))?.id ?? live[0]?.id ?? templates[0]?.id ?? null;

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("manus", id);
    else next.delete("manus");
    // replace, inte push: att bläddra mellan manus ska inte fylla webbläsarens
    // bakåtknapp med tjugo steg.
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const [pending, startAction] = useTransition();
  const [creating, startCreating] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const [newStep, setNewStep] = useState<FrameworkStep>("INTRO");
  const [newListId, setNewListId] = useState<string>("");
  const [newName, setNewName] = useState<string>("");

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

  const groups = groupTemplates(live, lists);

  /** Mappar som har egna manus — där gäller inte de allmänna. */
  const listsWithOwnScripts = useMemo(
    () => new Set(live.filter((t) => t.listId !== null && t.active).map((t) => t.listId as string)),
    [live]
  );

  function create() {
    const stepLabel = FRAMEWORK_STEPS.find((s) => s.value === newStep)?.label ?? newStep;
    const listName = lists.find((l) => l.id === newListId)?.name;
    // Ett eget namn om chefen skrivit ett, annars ett som bär mappen. Utan det
    // heter fem manus "Intro" i listan och det går inte att se vilket som
    // gäller var. Namnet går numera att ändra i efterhand.
    const name = newName.trim() || (listName ? `${stepLabel} — ${listName}` : stepLabel);
    startCreating(async () => {
      const t = await createScriptTemplate(name, newStep, newListId || null);
      setNewName("");
      // Markera det nyskapade manuset — det är det man just bad om att få
      // skriva i. Innan låg ett reload här och man hamnade i ett annat.
      select(t.id);
      router.refresh();
    });
  }

  /** Alla mutationer går samma väg: kör, hämta om serverdatan, behåll markeringen. */
  function run(fn: () => Promise<string | null | void>) {
    startAction(async () => {
      const message = await fn();
      setNotice(typeof message === "string" ? message : null);
      router.refresh();
    });
  }

  const stepLabelOf = (t: Template) =>
    FRAMEWORK_STEPS.find((s) => s.value === t.step)?.label ?? t.step;

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-[26px] mb-1" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
          Manus
        </h1>
        <p className="text-[13px] max-w-[720px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Du skriver manuset, inte en språkmodell. Varje manus kan ha flera varianter i
          prioritetsordning — den första vars datakrav är uppfyllda visas för säljaren.
          Sista varianten bör sakna krav, så att ett lead utan underlag ändå får något att säga.
        </p>
        <p className="text-[13px] max-w-[720px] leading-relaxed mt-2" style={{ color: "var(--text-muted)" }}>
          Ett manus kan knytas till en enskild ringlista. Har mappen egna manus är det{" "}
          <strong>bara</strong> de som visas där — de allmänna används inte alls i den mappen.
          Vill mappen bara ändra öppningen: kopiera det allmänna manuset hit och redigera kopian.
        </p>
      </div>

      {notice && (
        <div
          className="flex items-start gap-2 px-3.5 py-2.5 mb-4 rounded-md max-w-[860px]"
          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)" }}
        >
          <AlertTriangle size={13} className="mt-[2px] shrink-0" style={{ color: "var(--warning)" }} />
          <p className="text-[12px] leading-snug flex-1" style={{ color: "var(--text)" }}>{notice}</p>
          <button onClick={() => setNotice(null)} className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            Stäng
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Manuslista */}
        <div className="w-[250px] shrink-0">
          <div className="flex flex-col gap-3 mb-4">
            {live.length === 0 && (
              <p className="text-[12px] px-3 py-3 rounded-md"
                style={{ background: "var(--surface-inset)", color: "var(--text-dim)", border: "1px dashed var(--border-strong)" }}>
                Inga manus än. Skapa ett så syns det i cockpit direkt när det publicerats.
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

                {group.listId === null && group.templates.length === 0 && (
                  <p className="text-[11px] px-3 py-2" style={{ color: "var(--text-dim)" }}>
                    Inget allmänt manus
                  </p>
                )}

                <div className="flex flex-col gap-1">
                  {group.templates.map((t, i) => {
                    const published = t.versions.some((v) => v.publishedAt);
                    const isSelected = selected === t.id;
                    return (
                      <div
                        key={t.id}
                        className="rounded-md"
                        style={{
                          background: isSelected ? "var(--accent-muted)" : "transparent",
                          border: `1px solid ${isSelected ? "var(--border-strong)" : "transparent"}`,
                        }}
                      >
                        <button
                          onClick={() => select(t.id)}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-left"
                        >
                          <MessageSquare size={13} className="shrink-0" style={{ color: isSelected ? "var(--accent)" : "var(--text-dim)" }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
                              {t.name}
                            </p>
                            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                              {published ? "publicerat" : "utkast"}
                              {!t.active && " · avstängt"}
                            </p>
                          </div>
                        </button>

                        {/* Ordningen säljaren ser dem i. Syns bara när mappen
                            har mer än ett manus — annars är den en knapp som
                            inte gör något. */}
                        {isSelected && group.templates.length > 1 && (
                          <div className="flex items-center gap-1 px-3 pb-2">
                            <button
                              disabled={pending || i === 0}
                              onClick={() => run(() => moveTemplateOrder(t.id, "up").then(() => null))}
                              className="w-6 h-6 flex items-center justify-center rounded-sm disabled:opacity-30"
                              style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
                              title="Visa tidigare för säljaren"
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              disabled={pending || i === group.templates.length - 1}
                              onClick={() => run(() => moveTemplateOrder(t.id, "down").then(() => null))}
                              className="w-6 h-6 flex items-center justify-center rounded-sm disabled:opacity-30"
                              style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
                              title="Visa senare för säljaren"
                            >
                              <ArrowDown size={11} />
                            </button>
                            <span className="text-[10px] ml-1" style={{ color: "var(--text-dim)" }}>
                              plats {i + 1} av {group.templates.length}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Nytt manus */}
          <div className="rounded-lg p-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
              Nytt manus
            </p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Namn (valfritt)"
              className="w-full px-2 py-1.5 text-[12px] rounded-md outline-none mb-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
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
            <select
              value={newStep}
              onChange={(e) => setNewStep(e.target.value as FrameworkStep)}
              className="w-full px-2 py-1.5 text-[12px] rounded-md outline-none mb-1"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              {FRAMEWORK_STEPS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-[10px] mb-2 leading-snug" style={{ color: "var(--text-dim)" }}>
              Steget är en etikett för din egen skull. Säljaren ser manusets namn.
            </p>
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

          {/* Arkivet. Hopfällt: det ska gå att hitta tillbaka till ett manus,
              inte konkurrera med de som används. */}
          {archived.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowArchive((v) => !v)}
                className="flex items-center gap-1.5 px-1 py-1 w-full"
              >
                <Archive size={10} style={{ color: "var(--text-dim)" }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                  Arkiv ({archived.length})
                </p>
              </button>
              {showArchive && (
                <div className="flex flex-col gap-1 mt-1">
                  {archived.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => select(t.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-left"
                      style={{
                        background: selected === t.id ? "var(--accent-muted)" : "transparent",
                        border: `1px solid ${selected === t.id ? "var(--border-strong)" : "transparent"}`,
                      }}
                    >
                      <Archive size={12} className="shrink-0" style={{ color: "var(--text-dim)" }} />
                      <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>{t.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <TemplateHeader
                template={template}
                lists={lists}
                stepLabel={stepLabelOf(template)}
                pending={pending}
                hidesGeneral={
                  template.listId !== null && listsWithOwnScripts.has(template.listId)
                }
                onRename={(name) => run(() => renameTemplate(template.id, name).then(() => null))}
                onMove={(listId) => run(() => setTemplateList(template.id, listId).then(() => null))}
                onActive={(active) =>
                  run(() => setTemplateActive(template.id, active).then(() => null))
                }
                onArchive={(a) =>
                  run(async () => {
                    await setTemplateArchived(template.id, a);
                    return a
                      ? "Manuset ligger i arkivet. Texten finns kvar för statistiken, men ingen säljare ser det."
                      : null;
                  })
                }
                onDuplicate={(listId) =>
                  run(async () => {
                    const copy = await duplicateTemplate(template.id, listId);
                    select(copy.id);
                    return "Kopian är ett avstängt utkast. Publicera den och slå på den när texten sitter.";
                  })
                }
                onDelete={() =>
                  run(async () => {
                    const res = await deleteTemplate(template.id);
                    if (!res.archived) select(null);
                    return res.reason;
                  })
                }
              />

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
                versions={template.versions.map((v) => ({
                  id: v.id,
                  version: v.version,
                  published: v.publishedAt !== null,
                  variants: v.variants.map((x) => ({
                    label: x.label,
                    priority: x.priority,
                    body: x.body,
                    requiredKeys: parseRequiredKeys(x.requiredKeysJson),
                    minConfidence: x.minConfidence,
                  })),
                }))}
                initialVariants={initialVariants}
                claimKeys={claimKeys}
                sampleLeadId={effectiveSampleId}
                onChanged={() => router.refresh()}
                onNotice={setNotice}
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

/**
 * Vem manuset gäller, och vad som går att göra med det.
 *
 * Ligger ovanför texten och inte i en inställningsruta någon annanstans:
 * räckvidden är minst lika avgörande som orden, och den ska synas medan man
 * skriver dem.
 */
function TemplateHeader({
  template, lists, stepLabel, pending, hidesGeneral,
  onRename, onMove, onActive, onArchive, onDuplicate, onDelete,
}: {
  template: Template;
  lists: ListOption[];
  stepLabel: string;
  pending: boolean;
  hidesGeneral: boolean;
  onRename: (name: string) => void;
  onMove: (listId: string | null) => void;
  onActive: (active: boolean) => void;
  onArchive: (archived: boolean) => void;
  onDuplicate: (listId: string | null) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(template.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(template.name);
    setEditingName(false);
    setConfirmDelete(false);
    setCopyOpen(false);
  }, [template.id, template.name]);

  useEffect(() => {
    if (editingName) nameRef.current?.select();
  }, [editingName]);

  function commitName() {
    setEditingName(false);
    if (name.trim() && name.trim() !== template.name) onRename(name);
    else setName(template.name);
  }

  return (
    <div
      className="px-4 py-3.5 mb-3 rounded-lg"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
    >
      {/* Rad 1: namnet */}
      <div className="flex items-center gap-2 mb-3">
        {editingName ? (
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setName(template.name); setEditingName(false); }
            }}
            className="flex-1 min-w-0 px-2 py-1 text-[15px] font-semibold rounded-md outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--text)" }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-2 min-w-0 group"
            title="Byt namn"
          >
            <span className="text-[15px] font-semibold truncate" style={{ color: "var(--text)" }}>
              {template.name}
            </span>
            <Pencil size={11} className="shrink-0" style={{ color: "var(--text-dim)" }} />
          </button>
        )}

        {template.archived && (
          <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full shrink-0"
            style={{ background: "var(--surface)", color: "var(--text-dim)", border: "1px solid var(--border-strong)" }}>
            arkiverat
          </span>
        )}
        {!template.archived && !template.active && (
          <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full shrink-0"
            style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
            avstängt
          </span>
        )}
        {pending && <Loader2 size={12} className="animate-spin shrink-0" style={{ color: "var(--text-dim)" }} />}
      </div>

      {/* Rad 2: räckvidden */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Gäller
        </span>
        <select
          value={template.listId ?? ""}
          disabled={pending}
          onChange={(e) => onMove(e.target.value || null)}
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
        <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {template.listId
            ? "Visas bara för säljare som ringer i den mappen."
            : "Används i alla mappar som inte har egna manus."}
        </p>
        <span className="text-[10px] px-1.5 py-[2px] rounded-full" style={{ background: "var(--surface)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
          {stepLabel}
        </span>
      </div>

      {hidesGeneral && (
        <p className="text-[11.5px] mb-3 px-2.5 py-2 rounded-md leading-snug"
          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--text)" }}>
          Mappen har egna manus, så de allmänna används inte alls här. Ska mappen även ha
          det allmänna manuset: öppna det och välj <strong>Kopiera till</strong> den här mappen.
        </p>
      )}

      {/* Rad 3: åtgärder */}
      <div className="flex items-center gap-2 flex-wrap">
        {template.active ? (
          <ActionButton onClick={() => onActive(false)} disabled={pending} icon={<PowerOff size={11} />}>
            Stäng av
          </ActionButton>
        ) : (
          <ActionButton onClick={() => onActive(true)} disabled={pending} icon={<Power size={11} />}>
            Slå på
          </ActionButton>
        )}

        <div className="relative">
          <ActionButton onClick={() => setCopyOpen((v) => !v)} disabled={pending} icon={<Copy size={11} />}>
            Kopiera till
          </ActionButton>
          {copyOpen && (
            <div className="absolute z-20 mt-1 w-[260px] rounded-md py-1 max-h-[280px] overflow-y-auto"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-2)" }}>
              <button
                onClick={() => { setCopyOpen(false); onDuplicate(null); }}
                className="w-full text-left px-3 py-1.5 text-[12px]"
                style={{ color: "var(--text)" }}
              >
                Alla mappar
              </button>
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setCopyOpen(false); onDuplicate(l.id); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] truncate"
                  style={{ color: "var(--text)" }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {template.archived ? (
          <ActionButton onClick={() => onArchive(false)} disabled={pending} icon={<ArchiveRestore size={11} />}>
            Ta fram ur arkivet
          </ActionButton>
        ) : (
          <ActionButton onClick={() => onArchive(true)} disabled={pending} icon={<Archive size={11} />}>
            Arkivera
          </ActionButton>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
            style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            <span className="text-[11.5px]" style={{ color: "var(--text)" }}>Ta bort manuset?</span>
            <button
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              disabled={pending}
              className="flex items-center gap-1 px-2 py-[3px] text-[11px] font-semibold rounded-sm"
              style={{ background: "var(--danger)", color: "var(--on-danger)" }}
            >
              <Check size={10} /> Ja
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="flex items-center gap-1.5 ml-auto px-2.5 py-1.5 text-[11.5px] rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}
          >
            <Trash2 size={11} /> Ta bort
          </button>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick, disabled, icon, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] rounded-md disabled:opacity-50"
      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
    >
      {icon}
      {children}
    </button>
  );
}
