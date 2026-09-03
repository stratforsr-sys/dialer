"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import {
  Plus, Trash2, GripVertical, AlertTriangle, Check, Eye,
  Lock, FileText, Loader2, History, X,
} from "lucide-react";
import {
  saveVariants, publishVersion, createDraftVersion, previewVariants, discardDraft,
} from "@/app/actions/scripts";
import { placeholdersIn } from "@/lib/script-resolver";

export interface EditableVariant {
  label: string;
  priority: number;
  body: string;
  requiredKeys: string[];
  minConfidence: number;
}

/** Kontextnycklar finns alltid och behöver aldrig anges som krav. */
// {kontakt} och {förnamn} ger båda tilltalsnamnet — det är det man säger i ett
// samtal. {fullnamn} finns för de få ställen där hela namnet faktiskt behövs.
const CONTEXT_KEYS = ["företag", "kontakt", "förnamn", "fullnamn", "roll", "ort", "säljare"];

export function ScriptEditor({
  versionId,
  versionNumber,
  published,
  templateId,
  versions,
  initialVariants,
  claimKeys,
  sampleLeadId,
  onChanged,
  onNotice,
}: {
  versionId: string;
  versionNumber: number;
  published: boolean;
  templateId: string;
  /** Hela historiken — driver versionsväljaren. Nyast först. */
  versions: Array<{
    id: string;
    version: number;
    published: boolean;
    variants: EditableVariant[];
  }>;
  initialVariants: EditableVariant[];
  claimKeys: Array<{ key: string; count: number }>;
  sampleLeadId: string | null;
  /** Hämtar om serverdatan utan att kasta markeringen i vyn. */
  onChanged: () => void;
  onNotice: (message: string | null) => void;
}) {
  const [variants, setVariants] = useState<EditableVariant[]>(initialVariants);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewVariants>> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [publishError, setPublishError] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const readOnly = published;

  const update = useCallback((i: number, patch: Partial<EditableVariant>) => {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
    setSaved(false);
    setDirty(true);
  }, []);

  // Ett osparat utkast får inte försvinna för att någon råkar stänga fliken.
  // Manustexten är det enda i den här vyn som inte går att skriva om på tio
  // sekunder.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      setPreview(await previewVariants(variants, sampleLeadId));
    } finally {
      setPreviewing(false);
    }
  }, [variants, sampleLeadId]);

  // Förhandsgranskningen är hela poängen med redigeraren — den ska aldrig
  // behöva efterfrågas manuellt. Debounce så den inte går på varje tecken.
  useEffect(() => {
    const t = setTimeout(() => void runPreview(), 500);
    return () => clearTimeout(t);
  }, [runPreview]);

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        label: `Variant ${prev.length + 1}`,
        priority: (prev[prev.length - 1]?.priority ?? 0) + 10,
        body: "",
        requiredKeys: [],
        minConfidence: 60,
      },
    ]);
    setDirty(true);
  }

  function save() {
    startSaving(async () => {
      await saveVariants(versionId, variants);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2200);
    });
  }

  // Ingen `window.location.reload()` någonstans i den här filen längre. Den
  // kastade klientens tillstånd, och vyn valde då om till första manuset i
  // listan i stället för det man stod i — det var hela hoppet mellan manus.
  // `onChanged` hämtar ny serverdata och behåller markeringen.
  function publish() {
    startSaving(async () => {
      await saveVariants(versionId, variants);
      const res = await publishVersion(versionId);
      if (!res.ok) {
        setPublishError(res.problems);
        return;
      }
      setPublishError([]);
      setDirty(false);
      onChanged();
    });
  }

  function newDraft() {
    startSaving(async () => {
      await createDraftVersion(templateId);
      onChanged();
    });
  }

  function discard() {
    startSaving(async () => {
      const res = await discardDraft(versionId);
      if (!res.ok) onNotice(res.reason);
      else {
        setDirty(false);
        onChanged();
      }
    });
  }

  return (
    <div className="flex gap-5">
      {/* Redigering */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold px-2 py-[3px] rounded-sm"
              style={{
                background: published ? "var(--success-bg)" : "var(--warning-bg)",
                color: published ? "var(--success)" : "var(--warning)",
                border: `1px solid ${published ? "var(--success-border)" : "var(--warning-border)"}`,
              }}>
              {published ? <><Lock size={10} className="inline mr-1" />Version {versionNumber} · publicerad</> : `Version ${versionNumber} · utkast`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {versions.length > 1 && (
              <button onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                <History size={11} />
                {versions.length} versioner
              </button>
            )}

            {readOnly ? (
              <button onClick={newDraft} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                {saving ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                Nytt utkast
              </button>
            ) : (
              <>
                {/* Ett utkast gick tidigare bara att ta sig ur genom att
                    publicera det. Ett manus i produktion hade legat med ett
                    hängande utkast i månader av just det skälet. */}
                {versions.length > 1 && (
                  <button onClick={discard} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                    <X size={11} /> Kasta utkast
                  </button>
                )}
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md"
                  style={{
                    background: "var(--surface)",
                    border: `1px solid ${dirty ? "var(--warning-border)" : "var(--border-strong)"}`,
                    color: dirty ? "var(--warning)" : "var(--text-muted)",
                  }}>
                  {saved ? <><Check size={11} /> Sparat</> : dirty ? "Spara utkast •" : "Spara utkast"}
                </button>
                <button onClick={publish} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Publicera
                </button>
              </>
            )}
          </div>
        </div>

        {/* Historiken. Publicerade versioner är oföränderliga, så det här är
            enda vägen till vad som faktiskt stod i manuset när ett samtal
            ringdes — och till att ta tillbaka en formulering som fungerade
            bättre. */}
        {showHistory && (
          <div className="mb-3 rounded-lg overflow-hidden"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
            {versions.map((v) => (
              <div key={v.id} className="px-3.5 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                    Version {v.version}
                  </span>
                  <span className="text-[10px]" style={{ color: v.published ? "var(--success)" : "var(--warning)" }}>
                    {v.published ? "publicerad" : "utkast"}
                  </span>
                  {v.id === versionId && (
                    <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>· visas nu</span>
                  )}
                  {!readOnly && v.id !== versionId && (
                    <button
                      onClick={() => {
                        setVariants(v.variants);
                        setDirty(true);
                        setShowHistory(false);
                      }}
                      className="ml-auto text-[11px] px-2 py-[3px] rounded-sm"
                      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
                      title="Lägger texten i det öppna utkastet. Inget publiceras förrän du trycker Publicera."
                    >
                      Återanvänd texten
                    </button>
                  )}
                </div>
                <p className="text-[11.5px] leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
                  {v.variants.map((x) => x.body).join(" ").slice(0, 220) || "— tom —"}
                </p>
              </div>
            ))}
          </div>
        )}

        {published && (
          <p className="text-[12px] mb-3 px-3 py-2 rounded-md"
            style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Publicerade versioner går inte att ändra. Statistiken från varje samtal pekar på den
            text som faktiskt visades — ändrades den i efterhand skulle jämförelser mellan
            formuleringar bli meningslösa. Skapa ett nytt utkast i stället.
          </p>
        )}

        {publishError.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-md"
            style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            {publishError.map((p, i) => (
              <p key={i} className="text-[12px]" style={{ color: "var(--danger)" }}>{p}</p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {variants.map((v, i) => (
            <VariantCard
              key={i}
              index={i}
              variant={v}
              readOnly={readOnly}
              claimKeys={claimKeys}
              isWinner={preview?.resolved.variantId === `preview-${i}`}
              onChange={(patch) => update(i, patch)}
              onRemove={() => setVariants((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>

        {!readOnly && (
          <button onClick={addVariant}
            className="flex items-center gap-1.5 mt-3 px-3 py-2 text-[12px] rounded-md w-full justify-center"
            style={{ background: "var(--surface-inset)", border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}>
            <Plus size={12} /> Lägg till variant
          </button>
        )}
      </div>

      {/* Förhandsgranskning */}
      <div className="w-[330px] shrink-0">
        <div className="sticky top-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Eye size={12} style={{ color: "var(--text-dim)" }} />
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
              Så här ser säljaren det
            </p>
            {previewing && <Loader2 size={10} className="animate-spin" style={{ color: "var(--text-dim)" }} />}
          </div>

          <div className="rounded-lg p-4 mb-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
            {preview?.usedLead && (
              <p className="text-[10px] mb-2" style={{ color: "var(--text-dim)" }}>
                Testat mot {preview.usedLead}
              </p>
            )}
            {preview?.resolved.empty ? (
              <p className="text-[13px] italic" style={{ color: "var(--danger)" }}>
                Ingen variant matchar — säljaren får ingenting.
              </p>
            ) : (
              <>
                {/* Samma whitespace-pre-wrap som i cockpit — "så här ser
                    säljaren det" måste stämma ner på radbrytningsnivå. */}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
                  {preview?.resolved.text || "—"}
                </p>
                {preview?.resolved.label && (
                  <p className="text-[10px] mt-2 pt-2 border-t" style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}>
                    Variant: {preview.resolved.label}
                  </p>
                )}
              </>
            )}
          </div>

          {preview && preview.problems.length > 0 && (
            <div className="rounded-lg p-3 mb-3"
              style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
              {preview.problems.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-1 last:mb-0">
                  <AlertTriangle size={11} className="mt-[2px] shrink-0" style={{ color: "var(--warning)" }} />
                  <p className="text-[11px] leading-snug" style={{ color: "var(--text)" }}>{p}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg p-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-dim)" }}>
              Platshållare
            </p>
            <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
              Alltid tillgängliga:
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {CONTEXT_KEYS.map((k) => (
                <code key={k} className="text-[10px] px-1.5 py-[2px] rounded"
                  style={{ background: "var(--surface)", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                  {`{${k}}`}
                </code>
              ))}
            </div>
            {claimKeys.length > 0 ? (
              <>
                <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
                  Från underlaget — kräver att uppgiften finns:
                </p>
                <div className="flex flex-wrap gap-1">
                  {claimKeys.map((c) => (
                    <code key={c.key} className="text-[10px] px-1.5 py-[2px] rounded"
                      style={{ background: "var(--surface)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                      title={`${c.count} leads har den här uppgiften`}>
                      {`{${c.key}}`}
                    </code>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                Inga uppgifter i underlaget än — kör anrikningen först, så dyker nycklarna upp här.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantCard({
  index, variant, readOnly, claimKeys, isWinner, onChange, onRemove,
}: {
  index: number;
  variant: EditableVariant;
  readOnly: boolean;
  claimKeys: Array<{ key: string; count: number }>;
  isWinner: boolean;
  onChange: (patch: Partial<EditableVariant>) => void;
  onRemove: () => void;
}) {
  const used = placeholdersIn(variant.body).filter((k) => !CONTEXT_KEYS.includes(k));
  const missing = used.filter((k) => !variant.requiredKeys.includes(k));

  return (
    <div className="rounded-lg p-4"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isWinner ? "var(--accent)" : "var(--border)"}`,
        boxShadow: isWinner ? "0 0 0 1px var(--accent-border)" : "none",
      }}>
      <div className="flex items-center gap-2 mb-2.5">
        <GripVertical size={13} style={{ color: "var(--text-dim)" }} />
        <input
          value={variant.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={readOnly}
          className="flex-1 text-[13px] font-semibold bg-transparent outline-none"
          style={{ color: "var(--text)" }}
        />
        {isWinner && (
          <span className="text-[10px] font-semibold px-2 py-[2px] rounded-full"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
            Visas nu
          </span>
        )}
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
          Prioritet
          <input
            type="number"
            value={variant.priority}
            onChange={(e) => onChange({ priority: Number(e.target.value) })}
            disabled={readOnly}
            className="w-12 px-1.5 py-[2px] text-[11px] rounded-sm outline-none text-center"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        {!readOnly && index > 0 && (
          <button onClick={onRemove} className="w-6 h-6 flex items-center justify-center rounded-sm"
            style={{ color: "var(--text-dim)" }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <textarea
        value={variant.body}
        onChange={(e) => onChange({ body: e.target.value })}
        disabled={readOnly}
        rows={6}
        placeholder={"Jag såg att ni ligger på plats {seo.rank} när folk googlar {seo.keyword} — vet ni om det?\n\nRadbrytningar och blankrader behålls exakt som du skriver dem."}
        // resize-y i stället för resize-none: ett manus med flera stycken ska
        // gå att se i sin helhet medan det skrivs.
        className="w-full resize-y text-[13px] px-3 py-2.5 rounded-md outline-none leading-relaxed"
        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text)" }}
      />

      <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
          Kräver
        </span>
        {variant.requiredKeys.length === 0 && (
          <span className="text-[11px] px-2 py-[2px] rounded-full"
            style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
            inget — fungerar alltid
          </span>
        )}
        {variant.requiredKeys.map((k) => (
          <button
            key={k}
            onClick={() => !readOnly && onChange({ requiredKeys: variant.requiredKeys.filter((x) => x !== k) })}
            className="text-[10px] px-1.5 py-[2px] rounded"
            style={{ background: "var(--accent-muted)", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
            {k} ×
          </button>
        ))}

        {!readOnly && missing.length > 0 && (
          <>
            {missing.map((k) => (
              <button
                key={k}
                onClick={() => onChange({ requiredKeys: [...variant.requiredKeys, k] })}
                className="text-[10px] px-1.5 py-[2px] rounded"
                style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px dashed var(--warning-border)", fontFamily: "var(--font-mono)" }}
                title="Används i texten men saknas i kraven — klicka för att lägga till">
                + {k}
              </button>
            ))}
          </>
        )}

        {!readOnly && claimKeys.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value && !variant.requiredKeys.includes(e.target.value)) {
                onChange({ requiredKeys: [...variant.requiredKeys, e.target.value] });
              }
            }}
            className="text-[10px] px-1 py-[2px] rounded outline-none"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
          >
            <option value="">+ krav</option>
            {claimKeys.filter((c) => !variant.requiredKeys.includes(c.key)).map((c) => (
              <option key={c.key} value={c.key}>{c.key}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1 text-[10px] ml-auto" style={{ color: "var(--text-dim)" }}>
          Minsta säkerhet
          <input
            type="number"
            min={0}
            max={100}
            value={variant.minConfidence}
            onChange={(e) => onChange({ minConfidence: Number(e.target.value) })}
            disabled={readOnly}
            className="w-11 px-1.5 py-[2px] text-[10px] rounded-sm outline-none text-center"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
      </div>
    </div>
  );
}
