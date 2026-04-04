"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ChevronRight, Check, AlertCircle, X, ArrowLeft } from "lucide-react";
import { parseCSV, parseXLSX, autoGuessMapping } from "@/lib/csv-parser";
import { importLeads, type ImportResult } from "@/app/actions/import";
import type { CSVData, FieldMapping } from "@/types";

type Step = "upload" | "mapping" | "preview" | "done";

const SYSTEM_FIELDS = [
  { value: "skip",         label: "— Skippa —" },
  { value: "company",      label: "Bolagsnamn" },
  { value: "org_number",   label: "Org-nummer" },
  { value: "website",      label: "Hemsida" },
  { value: "name",         label: "Kontaktnamn" },
  { value: "role",         label: "Roll / Titel" },
  { value: "direct_phone", label: "Direkttelefon" },
  { value: "switchboard",  label: "Växel" },
  { value: "email",        label: "Email" },
  { value: "linkedin",     label: "LinkedIn" },
];

export function DbImportView() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("upload");
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      file.arrayBuffer().then((buf) => {
        const data = parseXLSX(buf);
        setCsvData(data);
        setMapping(autoGuessMapping(data.headers));
        setStep("mapping");
      });
    } else {
      file.text().then((text) => {
        const data = parseCSV(text);
        setCsvData(data);
        setMapping(autoGuessMapping(data.headers));
        setStep("mapping");
      });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function buildRows() {
    if (!csvData) return [];
    return csvData.rows.map((row) => {
      const mapped: Record<string, string> = {};
      csvData.headers.forEach((h) => {
        const field = mapping[h];
        if (field && field !== "skip") mapped[field] = row[h] || "";
      });
      return {
        companyName: mapped.company || "",
        orgNumber: mapped.org_number || undefined,
        website: mapped.website || undefined,
        contactName: mapped.name || undefined,
        contactRole: mapped.role || undefined,
        directPhone: mapped.direct_phone || undefined,
        switchboard: mapped.switchboard || undefined,
        email: mapped.email || undefined,
        linkedin: mapped.linkedin || undefined,
      };
    }).filter((r) => r.companyName.trim());
  }

  function handleImport() {
    const rows = buildRows();
    startTransition(async () => {
      const res = await importLeads(rows);
      setResult(res);
      setStep("done");
    });
  }

  const previewRows = buildRows().slice(0, 5);
  const totalRows = buildRows().length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 h-[56px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => router.push("/leads")}
          className="flex items-center gap-1 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} /> Leads
        </button>
        <span style={{ color: "var(--border-strong)" }}>/</span>
        <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
          Importera CSV
        </span>

        <div className="ml-auto flex items-center gap-2">
          {(["upload", "mapping", "preview", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                style={{
                  background: step === s ? "var(--accent)" : step > s ? "var(--success-bg)" : "var(--surface-inset)",
                  color: step === s ? "white" : step > s ? "var(--success)" : "var(--text-dim)",
                  border: `1px solid ${step === s ? "var(--accent)" : step > s ? "var(--success-border)" : "var(--border)"}`,
                }}
              >
                {step > s ? <Check size={10} /> : i + 1}
              </div>
              {i < 3 && <div className="w-4 h-[1px]" style={{ background: "var(--border)" }} />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">

          {/* Step 1: Upload */}
          {step === "upload" && (
            <motion.div key="upload" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="max-w-[520px] mx-auto">
              <h2 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text)" }}>Ladda upp fil</h2>
              <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>
                CSV eller Excel (.xlsx). Org-nummer används för att undvika dubletter.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer flex flex-col items-center justify-center gap-3 transition-colors"
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
                  borderRadius: "16px",
                  padding: "48px 24px",
                  background: dragOver ? "var(--accent-muted)" : "var(--surface-inset)",
                }}
              >
                <div className="w-12 h-12 rounded-[12px] flex items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                  <Upload size={20} style={{ color: "var(--text-muted)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Dra och släpp fil här</p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>eller klicka för att välja — CSV, XLS, XLSX</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </motion.div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && csvData && (
            <motion.div key="mapping" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="max-w-[600px] mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>Mappa kolumner</h2>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>{csvData.rows.length} rader hittades</p>
                </div>
                <button onClick={() => setStep("upload")} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <X size={12} /> Byt fil
                </button>
              </div>

              <div className="rounded-[14px] overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
                {csvData.headers.map((header, i) => (
                  <div key={header} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: i < csvData.headers.length - 1 ? "1px solid var(--border-subtle)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface-inset)" }}>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{header}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>Ex: {csvData.rows[0]?.[header] || "—"}</p>
                    </div>
                    <ChevronRight size={13} style={{ color: "var(--text-dim)" }} />
                    <select
                      value={mapping[header] || "skip"}
                      onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as import("@/types").SystemFieldKey }))}
                      className="text-[12px] outline-none px-2 py-[5px]"
                      style={{
                        background: mapping[header] && mapping[header] !== "skip" ? "var(--accent-muted)" : "var(--surface-inset)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "7px",
                        color: mapping[header] && mapping[header] !== "skip" ? "var(--accent)" : "var(--text-muted)",
                        minWidth: "140px",
                      }}
                    >
                      {SYSTEM_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep("preview")} className="w-full py-3 text-[14px] font-semibold rounded-[10px]" style={{ background: "var(--accent)", color: "white" }}>
                Förhandsgranska →
              </button>
            </motion.div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="max-w-[700px] mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>Förhandsgranska</h2>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>{totalRows} leads kommer importeras</p>
                </div>
                <button onClick={() => setStep("mapping")} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <ArrowLeft size={12} /> Ändra mappning
                </button>
              </div>

              <div className="rounded-[14px] overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ background: "var(--surface-inset)", borderBottom: "1px solid var(--border)" }}>
                      {["Bolag", "Org-nr", "Kontakt", "Telefon", "Email"].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface)" }}>
                        <td className="px-4 py-2 text-[12px] font-medium" style={{ color: "var(--text)" }}>{row.companyName}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.orgNumber || "—"}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.contactName || "—"}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.directPhone || "—"}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalRows > 5 && (
                  <div className="px-4 py-2 text-[11px]" style={{ background: "var(--surface-inset)", color: "var(--text-dim)" }}>+ {totalRows - 5} fler rader</div>
                )}
              </div>

              <button
                onClick={handleImport}
                disabled={isPending || totalRows === 0}
                className="w-full py-3 text-[14px] font-semibold rounded-[10px] flex items-center justify-center gap-2"
                style={{ background: "var(--accent)", color: "white", opacity: isPending || totalRows === 0 ? 0.6 : 1 }}
              >
                {isPending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importerar...</> : `Importera ${totalRows} leads →`}
              </button>
            </motion.div>
          )}

          {/* Step 4: Done */}
          {step === "done" && result && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="max-w-[480px] mx-auto text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                <Check size={28} style={{ color: "var(--success)" }} />
              </div>
              <h2 className="text-[22px] font-semibold mb-6" style={{ color: "var(--text)" }}>Import klar!</h2>
              <div className="flex justify-center gap-8 mb-6">
                {[
                  { label: "Skapade",    value: result.created,  color: "var(--success)" },
                  { label: "Uppdaterade",value: result.updated,  color: "var(--info)" },
                  { label: "Skippade",   value: result.skipped,  color: "var(--text-dim)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <p className="text-[28px] font-bold" style={{ color }}>{value}</p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{label}</p>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div className="text-left p-4 rounded-[10px] mb-6" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                  <p className="text-[12px] font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                    <AlertCircle size={13} /> {result.errors.length} fel
                  </p>
                  {result.errors.slice(0, 5).map((e, i) => <p key={i} className="text-[11px]" style={{ color: "var(--danger)" }}>{e}</p>)}
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={() => { setCsvData(null); setMapping({}); setResult(null); setStep("upload"); }} className="px-5 py-2 text-[13px] font-medium rounded-[8px]" style={{ background: "var(--surface-inset)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Importera fler
                </button>
                <button onClick={() => router.push("/leads")} className="px-5 py-2 text-[13px] font-medium rounded-[8px]" style={{ background: "var(--accent)", color: "white" }}>
                  Visa leads →
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
