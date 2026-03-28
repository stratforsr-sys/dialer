"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet, Sparkles, ArrowRight, FileUp } from "lucide-react";
import type { CSVData, FieldMapping } from "@/types";
import { parseCSV, parseXLSX, autoGuessMapping } from "@/lib/csv-parser";

interface ImportViewProps {
  onImportReady: (data: CSVData, mapping: FieldMapping, fileName: string) => void;
  onLoadDemo: () => void;
}

export function ImportView({ onImportReady, onLoadDemo }: ImportViewProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    const reader = new FileReader();
    reader.onload = (e) => {
      let parsed: CSVData;
      if (isExcel) {
        const buffer = e.target?.result as ArrayBuffer;
        parsed = parseXLSX(buffer);
      } else {
        const text = e.target?.result as string;
        parsed = parseCSV(text);
      }
      if (parsed.headers.length > 0) {
        const guessed = autoGuessMapping(parsed.headers);
        onImportReady(parsed, guessed, file.name);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, [onImportReady]);

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(43,181,116,0.08)] border border-[rgba(43,181,116,0.15)] mb-5">
            <Sparkles size={13} className="text-[#2bb574]" />
            <span className="text-xs font-medium text-[#2bb574]">Sales Dialer v2</span>
          </div>
          <h1 className="text-3xl font-bold text-telink-text mb-2 tracking-tight">
            Starta en ny ringlista
          </h1>
          <p className="text-telink-muted text-sm max-w-md mx-auto">
            Ladda upp din fil med leads så mappar vi automatiskt kolumnerna åt dig. Stöd för CSV, Excel (xlsx), Apollo, Clay m.fl.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`
            drop-zone relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200
            ${dragOver
              ? "active border-[#2bb574] bg-[rgba(43,181,116,0.04)]"
              : "border-telink-border hover:border-telink-border-light hover:bg-telink-surface/40"
            }
          `}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          />
          <div className={`
            w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center transition-all
            ${dragOver ? "bg-[rgba(43,181,116,0.15)]" : "bg-telink-surface-light"}
          `}>
            <FileUp size={28} className={dragOver ? "text-[#2bb574]" : "text-telink-muted"} />
          </div>
          <p className="text-sm font-medium text-telink-text mb-1">
            {dragOver ? "Släpp filen här" : "Dra & släpp din fil"}
          </p>
          <p className="text-xs text-telink-muted">
            eller klicka för att bläddra • CSV, TSV, Excel
          </p>
          {fileName && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-telink-surface border border-telink-border">
              <FileSpreadsheet size={14} className="text-[#2bb574]" />
              <span className="text-xs text-telink-text font-medium">{fileName}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px bg-telink-border" />
          <span className="text-xs text-telink-dim font-medium">ELLER</span>
          <div className="flex-1 h-px bg-telink-border" />
        </div>

        {/* Demo button */}
        <button
          onClick={onLoadDemo}
          className="w-full group flex items-center justify-center gap-3 px-5 py-4 rounded-2xl border border-telink-border bg-telink-surface/50 hover:bg-telink-surface-hover hover:border-telink-border-light transition-all cursor-pointer"
        >
          <Upload size={16} className="text-telink-muted group-hover:text-[#2bb574] transition-colors" />
          <span className="text-sm font-medium text-telink-text">Ladda demo-data (8 SaaS-leads)</span>
          <ArrowRight size={14} className="text-telink-dim group-hover:text-telink-muted group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>
    </div>
  );
}
