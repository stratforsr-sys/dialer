"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, AlertCircle, ChevronDown, FolderPlus } from "lucide-react";
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        {/* Stepper */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${step >= 1 ? "bg-[rgba(43,181,116,0.12)] text-[#2bb574]" : "bg-telink-surface text-telink-dim"}`}>
            {step > 1 ? <Check size={12} /> : <span>1</span>}
            <span>Koppla fält</span>
          </div>
          <div className="w-8 h-px bg-telink-border" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${step >= 2 ? "bg-[rgba(43,181,116,0.12)] text-[#2bb574]" : "bg-telink-surface text-telink-dim"}`}>
            <span>2</span>
            <span>Granska</span>
          </div>
        </div>

        {/* Header */}
        <h2 className="text-xl font-bold text-telink-text mb-1">
          {step === 1 ? "Koppla kolumner till fält" : "Granska import"}
        </h2>
        <p className="text-sm text-telink-muted mb-6">
          {step === 1
            ? `${csvData.headers.length} kolumner hittade • ${csvData.rows.length} rader`
            : `${csvData.rows.length} kontakter redo att importeras`
          }
        </p>

        {step === 1 ? (
          <>
            {/* Missing required warning */}
            {missingRequired.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] mb-5">
                <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-300">Obligatoriska fält saknas</p>
                  <p className="text-xs text-telink-muted mt-0.5">
                    Koppla: {missingRequired.map(k => SYSTEM_FIELDS.find(f => f.key === k)?.label).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Column mapping rows */}
            <div className="space-y-2">
              {csvData.headers.map((header) => {
                const sampleValues = csvData.rows.slice(0, 3).map(r => r[header]).filter(Boolean);
                const currentMapping = mapping[header] || "skip";
                const fieldDef = SYSTEM_FIELDS.find(f => f.key === currentMapping);
                const isRequired = fieldDef?.required;

                return (
                  <div
                    key={header}
                    className="flex items-center gap-4 p-3.5 rounded-xl bg-telink-surface border border-telink-border hover:border-telink-border-light transition-colors"
                  >
                    {/* CSV column info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileSpreadsheet size={13} className="text-telink-dim flex-shrink-0" />
                        <span className="text-sm font-semibold text-telink-text truncate">{header}</span>
                      </div>
                      {sampleValues.length > 0 && (
                        <p className="text-xs text-telink-dim truncate pl-5">
                          {sampleValues.join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <ArrowRight size={14} className="text-telink-dim flex-shrink-0" />

                    {/* System field dropdown */}
                    <div className="relative w-48 flex-shrink-0">
                      <select
                        value={currentMapping}
                        onChange={(e) => handleFieldChange(header, e.target.value as SystemFieldKey)}
                        className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg bg-telink-surface-light border border-telink-border text-sm text-telink-text cursor-pointer focus:outline-none focus:border-[#2bb574] transition-colors"
                      >
                        {SYSTEM_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>
                            {f.label} {f.required ? "★" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-telink-dim pointer-events-none" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-telink-border">
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-telink-muted hover:text-telink-text hover:bg-telink-surface-hover transition-all cursor-pointer"
              >
                <ArrowLeft size={14} /> Tillbaka
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={missingRequired.length > 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#2bb574] text-white hover:shadow-[0_0_25px_rgba(43,181,116,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Nästa <ArrowRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Preview table */}
            <div className="rounded-xl border border-telink-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-telink-border bg-telink-surface">
                      {Object.entries(mapping).filter(([,v]) => v !== "skip").map(([,sysField]) => {
                        const def = SYSTEM_FIELDS.find(f => f.key === sysField);
                        return (
                          <th key={sysField} className="px-4 py-3 text-left text-xs font-semibold text-telink-muted whitespace-nowrap">
                            {def?.label || sysField}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-telink-border/50 hover:bg-telink-surface/40">
                        {Object.entries(mapping).filter(([,v]) => v !== "skip").map(([csvCol, sysField]) => (
                          <td key={`${i}-${sysField}`} className="px-4 py-2.5 text-telink-text whitespace-nowrap truncate max-w-[200px]">
                            {row[csvCol] || <span className="text-telink-dim">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-telink-surface border-t border-telink-border text-xs text-telink-dim">
                Visar {previewRows.length} av {csvData.rows.length} rader
              </div>
            </div>

            {/* List name input */}
            <div className="mt-6 p-4 rounded-xl bg-telink-surface border border-telink-border">
              <label className="flex items-center gap-2 text-sm font-medium text-telink-text mb-2">
                <FolderPlus size={14} className="text-[#2bb574]" />
                Namn på ringlistan
              </label>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="T.ex. SaaS-leads Q1"
                className="w-full px-4 py-2.5 rounded-lg bg-telink-surface-light border border-telink-border text-sm text-telink-text placeholder:text-telink-dim focus:outline-none focus:border-[#2bb574] transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-telink-border">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-telink-muted hover:text-telink-text hover:bg-telink-surface-hover transition-all cursor-pointer"
              >
                <ArrowLeft size={14} /> Tillbaka
              </button>
              <button
                onClick={() => onConfirm(listName)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#2bb574] text-white hover:shadow-[0_0_25px_rgba(43,181,116,0.3)] transition-all cursor-pointer"
              >
                <Check size={15} /> Importera {csvData.rows.length} kontakter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
