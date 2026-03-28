"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, AlertCircle, ChevronDown, FolderPlus, Zap } from "lucide-react";
import type { CSVData, FieldMapping, SystemFieldKey } from "@/types";
import { SYSTEM_FIELDS } from "@/lib/constants";

interface MappingViewProps {
  csvData: CSVData;
  mapping: FieldMapping;
  setMapping: React.Dispatch<React.SetStateAction<FieldMapping>>;
  defaultListName: string;
  onConfirm: (listName: string) => void;
  onBack: () => void;
}

export function MappingView({ csvData, mapping, setMapping, defaultListName, onConfirm, onBack }: MappingViewProps) {
  const [step, setStep] = useState<1 | 2>(1); // 1 = mapping, 2 = preview
  const [listName, setListName] = useState(defaultListName);

  const requiredFields = SYSTEM_FIELDS.filter(f => f.required).map(f => f.key as string);
  const mappedFields = Object.values(mapping).filter(v => v !== "skip") as string[];
  const missingRequired = requiredFields.filter(r => !mappedFields.includes(r));

  const handleFieldChange = (csvCol: string, value: SystemFieldKey) => {
    setMapping(prev => ({ ...prev, [csvCol]: value }));
  };

  const previewRows = csvData.rows.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto bg-telink-bg">
      <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-up">
        {/* Stepper - Premium styling */}
        <div className="flex items-center gap-4 mb-10">
          <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            step >= 1
              ? "bg-telink-accent-muted text-telink-accent border border-telink-accent/20"
              : "bg-telink-surface text-telink-dim border border-telink-border"
          }`}>
            {step > 1 ? (
              <div className="w-5 h-5 rounded-full bg-telink-accent flex items-center justify-center">
                <Check size={12} className="text-telink-bg" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-telink-accent/20 flex items-center justify-center text-[10px] font-bold">1</div>
            )}
            <span>Koppla fält</span>
          </div>
          <div className="w-12 h-px bg-gradient-to-r from-telink-accent/50 to-telink-border" />
          <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            step >= 2
              ? "bg-telink-accent-muted text-telink-accent border border-telink-accent/20"
              : "bg-telink-surface text-telink-dim border border-telink-border"
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step >= 2 ? "bg-telink-accent/20" : "bg-telink-surface-elevated"
            }`}>2</div>
            <span>Granska</span>
          </div>
        </div>

        {/* Header - Premium styling */}
        <h2 className="text-2xl font-bold text-telink-text mb-2">
          {step === 1 ? "Koppla kolumner till fält" : "Granska import"}
        </h2>
        <p className="text-sm text-telink-muted mb-8">
          {step === 1
            ? <><span className="text-telink-text-secondary font-medium">{csvData.headers.length}</span> kolumner hittade • <span className="text-telink-text-secondary font-medium">{csvData.rows.length}</span> rader</>
            : <><span className="text-telink-accent font-medium">{csvData.rows.length}</span> kontakter redo att importeras</>
          }
        </p>

        {step === 1 ? (
          <>
            {/* Missing required warning - Premium styling */}
            {missingRequired.length > 0 && (
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">Obligatoriska fält saknas</p>
                  <p className="text-xs text-telink-muted mt-1">
                    Koppla: {missingRequired.map(k => SYSTEM_FIELDS.find(f => f.key === k)?.label).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Column mapping rows - Premium styling */}
            <div className="space-y-3">
              {csvData.headers.map((header, idx) => {
                const sampleValues = csvData.rows.slice(0, 3).map(r => r[header]).filter(Boolean);
                const currentMapping = mapping[header] || "skip";
                const fieldDef = SYSTEM_FIELDS.find(f => f.key === currentMapping);
                const isRequired = fieldDef?.required;
                const isMapped = currentMapping !== "skip";

                return (
                  <div
                    key={header}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      isMapped
                        ? "bg-telink-surface border-telink-accent/20"
                        : "bg-telink-surface border-telink-border hover:border-telink-border-light"
                    }`}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    {/* CSV column info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isMapped ? "bg-telink-accent/10" : "bg-telink-surface-elevated"
                        }`}>
                          <FileSpreadsheet size={14} className={isMapped ? "text-telink-accent" : "text-telink-dim"} />
                        </div>
                        <span className="text-sm font-semibold text-telink-text truncate">{header}</span>
                      </div>
                      {sampleValues.length > 0 && (
                        <p className="text-xs text-telink-dim truncate pl-10 font-mono">
                          {sampleValues.join(" • ")}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isMapped ? "bg-telink-accent/10" : "bg-telink-surface-elevated"
                    }`}>
                      <ArrowRight size={14} className={isMapped ? "text-telink-accent" : "text-telink-dim"} />
                    </div>

                    {/* System field dropdown - Premium */}
                    <div className="relative w-52 flex-shrink-0">
                      <select
                        value={currentMapping}
                        onChange={(e) => handleFieldChange(header, e.target.value as SystemFieldKey)}
                        className={`w-full appearance-none pl-4 pr-10 py-2.5 rounded-xl text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-telink-accent/20 transition-all ${
                          isMapped
                            ? "bg-telink-accent-muted border border-telink-accent/20 text-telink-accent"
                            : "bg-telink-surface-elevated border border-telink-border text-telink-text hover:border-telink-border-light"
                        }`}
                      >
                        {SYSTEM_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>
                            {f.label} {f.required ? "★" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                        isMapped ? "text-telink-accent" : "text-telink-dim"
                      }`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions - Premium */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-telink-border">
              <button
                onClick={onBack}
                className="group flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-telink-muted hover:text-telink-text hover:bg-telink-surface transition-all cursor-pointer"
              >
                <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> Tillbaka
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={missingRequired.length > 0}
                className="group flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-telink-accent to-pink-500 text-telink-bg hover:shadow-glow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Nästa <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Preview table - Premium styling */}
            <div className="rounded-2xl border border-telink-border overflow-hidden bg-telink-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-telink-border bg-telink-surface-elevated">
                      {Object.entries(mapping).filter(([,v]) => v !== "skip").map(([,sysField]) => {
                        const def = SYSTEM_FIELDS.find(f => f.key === sysField);
                        return (
                          <th key={sysField} className="px-5 py-4 text-left text-xs font-semibold text-telink-muted uppercase tracking-wide whitespace-nowrap">
                            {def?.label || sysField}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-telink-border/50 hover:bg-telink-surface-hover/50 transition-colors">
                        {Object.entries(mapping).filter(([,v]) => v !== "skip").map(([csvCol, sysField]) => (
                          <td key={`${i}-${sysField}`} className="px-5 py-3.5 text-telink-text whitespace-nowrap truncate max-w-[200px]">
                            {row[csvCol] || <span className="text-telink-dim">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 bg-telink-surface-elevated border-t border-telink-border text-xs text-telink-dim flex items-center justify-between">
                <span>Visar {previewRows.length} av {csvData.rows.length} rader</span>
                <span className="text-telink-accent font-medium">{csvData.rows.length} kontakter totalt</span>
              </div>
            </div>

            {/* List name input - Premium styling */}
            <div className="mt-8 p-5 rounded-2xl bg-telink-surface border border-telink-border">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-telink-text mb-3">
                <div className="w-8 h-8 rounded-lg bg-telink-accent/10 flex items-center justify-center">
                  <FolderPlus size={14} className="text-telink-accent" />
                </div>
                Namn på ringlistan
              </label>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="T.ex. SaaS-leads Q1"
                className="w-full px-4 py-3 rounded-xl bg-telink-surface-elevated border border-telink-border text-sm text-telink-text placeholder:text-telink-dim focus:outline-none focus:border-telink-accent/40 focus:ring-2 focus:ring-telink-accent/10 transition-all"
              />
            </div>

            {/* Actions - Premium */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-telink-border">
              <button
                onClick={() => setStep(1)}
                className="group flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-telink-muted hover:text-telink-text hover:bg-telink-surface transition-all cursor-pointer"
              >
                <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> Tillbaka
              </button>
              <button
                onClick={() => onConfirm(listName)}
                className="group flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-telink-accent via-pink-500 to-telink-violet text-telink-bg hover:shadow-glow-lg transition-all cursor-pointer"
              >
                <Check size={16} /> Importera {csvData.rows.length} kontakter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
