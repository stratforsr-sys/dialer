"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ChevronRight, Check, AlertCircle, X, ArrowLeft } from "lucide-react";
import { parseCSV, parseXLSX, autoGuessMapping } from "@/lib/csv-parser";
import type { CSVData, FieldMapping } from "@/types";

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

type ProgressState = {
  total: number;
  done: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

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
  const [step, setStep] = useState<Step>("upload");
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  async function handleImport() {
    const rows = buildRows();
    if (!rows.length) return;

    abortRef.current = new AbortController();
    setStep("importing");
    setProgress({ total: rows.length, done: 0, created: 0, updated: 0, skipped: 0, errors: [] });

    try {
      const res = await fetch("/api/import-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.complete) {
              setProgress(data);
              setStep("done");
              return;
            }
            if (data.error) throw new Error(data.error);
            setProgress(data);
          } catch {
            // malformed chunk — ignore
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setProgress((p) => p ? { ...p, errors: [(err as Error).message] } : null);
        setStep("done");
      }
    }
  }

  const previewRows = buildRows().slice(0, 5);
  const totalRows = buildRows().length;
  const progressPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const STEPS: Step[] = ["upload", "mapping", "preview", "done"];

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
        <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>Importera CSV</span>

        {/* Step indicators */}
        <div className="ml-auto flex items-center gap-2">
          {STEPS.map((s, i) => {
            const idx = STEPS.indexOf(step === "importing" ? "preview" : step);
            const done = i < idx;
            const active = i === idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                  style={{
                    background: active ? "var(--accent)" : done ? "var(--success-bg)" : "var(--surface-inset)",
                    color: active ? "var(--bg)" : done ? "var(--success)" : "var(--text-dim)",
                    border: `1px solid ${active ? "var(--accent)" : done ? "var(--success-border)" : "var(--border)"}`,
                  }}
                >
                  {done ? <Check size={10} /> : i + 1}
                </div>
                {i < 3 && <div className="w-4 h-[1px]" style={{ background: "var(--border)" }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">

          {/* Step 1: Upload */}
          {step === "upload" && (
            <motion.div key="upload" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="max-w-[520px] mx-auto">
              <h2 className="text-[22px] mb-1" style={{ color: "var(--text)" }}>Ladda upp fil</h2>
              <p className="text-[13px] mb-6" style={{ color: "var(--text-muted)" }}>
                CSV eller Excel (.xlsx). Org-nummer används för att undvika dubletter.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer flex flex-col items-center justify-center gap-4 transition-all"
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
                  borderRadius: "18px",
                  padding: "52px 24px",
                  background: dragOver ? "var(--accent-muted)" : "var(--surface-inset)",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  className="w-12 h-12 rounded-[14px] flex items-center justify-center"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-sm)" }}
                >
                  <Upload size={20} style={{ color: "var(--text-muted)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Dra och släpp fil här</p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>eller klicka — CSV, XLS, XLSX</p>
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
                  <h2 className="text-[22px]" style={{ color: "var(--text)" }}>Mappa kolumner</h2>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>{csvData.rows.length} rader hittades</p>
                </div>
                <button onClick={() => setStep("upload")} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <X size={12} /> Byt fil
                </button>
              </div>

              <div className="rounded-[16px] overflow-hidden mb-6" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                {csvData.headers.map((header, i) => (
                  <div key={header} className="flex items-center gap-4 px-4 py-3"
                    style={{ borderBottom: i < csvData.headers.length - 1 ? "1px solid var(--border-subtle)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--surface-inset)" }}>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{header}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Ex: {csvData.rows[0]?.[header] || "—"}</p>
                    </div>
                    <ChevronRight size={13} style={{ color: "var(--text-dim)" }} />
                    <select
                      value={mapping[header] || "skip"}
                      onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as import("@/types").SystemFieldKey }))}
                      className="text-[12px] outline-none px-2 py-[5px]"
                      style={{
                        background: mapping[header] && mapping[header] !== "skip" ? "var(--accent-muted)" : "var(--surface-inset)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "8px",
                        color: mapping[header] && mapping[header] !== "skip" ? "var(--accent)" : "var(--text-muted)",
                        minWidth: "140px",
                      }}
                    >
                      {SYSTEM_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep("preview")} className="w-full py-3 text-[14px] font-semibold rounded-[12px]" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                Förhandsgranska →
              </button>
            </motion.div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="max-w-[700px] mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[22px]" style={{ color: "var(--text)" }}>Förhandsgranska</h2>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>{totalRows} leads kommer importeras</p>
                </div>
                <button onClick={() => setStep("mapping")} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <ArrowLeft size={12} /> Ändra mappning
                </button>
              </div>

              <div className="rounded-[16px] overflow-hidden mb-6" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ background: "var(--surface-inset)", borderBottom: "1px solid var(--border)" }}>
                      {["Bolag", "Org-nr", "Kontakt", "Telefon", "Email"].map((h) => (
                        <th key={h} className="text-left px-4 py-2" style={{ color: "var(--text-dim)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface)" }}>
                        <td className="px-4 py-2 text-[12px] font-medium" style={{ color: "var(--text)" }}>{row.companyName}</td>
                        <td className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{row.orgNumber || "—"}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.contactName || "—"}</td>
                        <td className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{row.directPhone || "—"}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{row.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalRows > 5 && (
                  <div className="px-4 py-2 text-[11px]" style={{ background: "var(--surface-inset)", color: "var(--text-dim)" }}>
                    + {totalRows - 5} fler rader
                  </div>
                )}
              </div>

              <button
                onClick={handleImport}
                disabled={totalRows === 0}
                className="w-full py-3 text-[14px] font-semibold rounded-[12px]"
                style={{ background: "var(--accent)", color: "var(--bg)", opacity: totalRows === 0 ? 0.5 : 1 }}
              >
                Importera {totalRows} leads →
              </button>
            </motion.div>
          )}

          {/* Importing — streaming progress */}
          {step === "importing" && progress && (
            <motion.div key="importing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-[520px] mx-auto">
              <h2 className="text-[22px] mb-2" style={{ color: "var(--text)" }}>Importerar…</h2>
              <p className="text-[13px] mb-8" style={{ color: "var(--text-muted)" }}>
                Behandlar {progress.total.toLocaleString("sv-SE")} leads i omgångar om 50
              </p>

              {/* Progress bar */}
              <div className="rounded-[12px] overflow-hidden mb-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                <motion.div
                  className="h-[6px]"
                  style={{ background: "var(--accent)" }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>

              <div className="flex items-center justify-between mb-8">
                <span className="text-[12px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {progress.done.toLocaleString("sv-SE")} / {progress.total.toLocaleString("sv-SE")}
                </span>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{progressPct}%</span>
              </div>

              {/* Live counters */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Skapade",     value: progress.created, color: "var(--success)" },
                  { label: "Uppdaterade", value: progress.updated, color: "var(--info)" },
                  { label: "Skippade",    value: progress.skipped, color: "var(--text-dim)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-4 rounded-[12px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <p className="text-[24px] font-bold tabular-nums" style={{ color, fontFamily: "var(--font-mono)" }}>{value}</p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Done */}
          {step === "done" && progress && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-w-[480px] mx-auto text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
                <Check size={28} style={{ color: "var(--success)" }} />
              </div>
              <h2 className="text-[26px] mb-6" style={{ color: "var(--text)" }}>Import klar</h2>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: "Skapade",     value: progress.created, color: "var(--success)" },
                  { label: "Uppdaterade", value: progress.updated, color: "var(--info)" },
                  { label: "Skippade",    value: progress.skipped, color: "var(--text-dim)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-4 rounded-[14px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <p className="text-[28px] font-bold tabular-nums" style={{ color, fontFamily: "var(--font-mono)" }}>{value}</p>
                    <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                  </div>
                ))}
              </div>

              {progress.errors.length > 0 && (
                <div className="text-left p-4 rounded-[12px] mb-6" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                  <p className="text-[12px] font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                    <AlertCircle size={13} /> {progress.errors.length} fel
                  </p>
                  {progress.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-[11px]" style={{ color: "var(--danger)" }}>{e}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setCsvData(null); setMapping({}); setProgress(null); setStep("upload"); }}
                  className="px-5 py-2 text-[13px] font-medium rounded-[10px]"
                  style={{ background: "var(--surface-inset)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
                >
                  Importera fler
                </button>
                <button
                  onClick={() => router.push("/leads")}
                  className="px-5 py-2 text-[13px] font-medium rounded-[10px]"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
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
