"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet, Sparkles, ArrowRight, FileUp, Zap } from "lucide-react";
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
    <div className="h-full flex items-center justify-center p-8 bg-clicknet-bg">
      <div className="w-full max-w-xl animate-fade-up">
        {/* Header - Premium styling */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-clicknet-accent/10 via-pink-500/10 to-clicknet-violet/10 border border-clicknet-accent/20 mb-6">
            <Zap size={14} className="text-clicknet-accent" />
            <span className="text-xs font-semibold gradient-text">clicknet Dialer Pro</span>
          </div>
          <h1 className="text-3xl font-bold text-clicknet-text mb-3 tracking-tight">
            Starta en ny ringlista
          </h1>
          <p className="text-clicknet-muted text-sm max-w-md mx-auto leading-relaxed">
            Ladda upp din fil med leads så mappar vi automatiskt kolumnerna åt dig. Stöd för CSV, Excel (xlsx), Apollo, Clay m.fl.
          </p>
        </div>

        {/* Drop zone - Premium styling */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`
            relative cursor-pointer rounded-3xl border-2 border-dashed p-14 text-center transition-all duration-300
            ${dragOver
              ? "border-clicknet-accent bg-clicknet-accent/5 shadow-glow-sm"
              : "border-clicknet-border hover:border-clicknet-accent/40 hover:bg-clicknet-surface/40"
            }
          `}
        >
          {/* Background glow on hover */}
          <div className={`absolute inset-0 rounded-3xl bg-gradient-radial from-clicknet-accent/5 to-transparent transition-opacity ${dragOver ? "opacity-100" : "opacity-0"}`} />

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          />
          <div className={`
            relative w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-300
            ${dragOver
              ? "bg-gradient-to-br from-clicknet-accent/20 to-pink-500/20 scale-110"
              : "bg-clicknet-surface-elevated"
            }
          `}>
            <FileUp size={32} className={`transition-colors ${dragOver ? "text-clicknet-accent" : "text-clicknet-muted"}`} />
          </div>
          <p className="relative text-base font-semibold text-clicknet-text mb-2">
            {dragOver ? "Släpp filen här" : "Dra & släpp din fil"}
          </p>
          <p className="relative text-sm text-clicknet-muted">
            eller klicka för att bläddra • CSV, TSV, Excel
          </p>
          {fileName && (
            <div className="relative mt-6 inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-clicknet-accent-muted border border-clicknet-accent/20">
              <FileSpreadsheet size={16} className="text-clicknet-accent" />
              <span className="text-sm text-clicknet-accent font-medium">{fileName}</span>
            </div>
          )}
        </div>

        {/* Divider - Premium */}
        <div className="flex items-center gap-4 my-10">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-clicknet-border to-transparent" />
          <span className="text-xs text-clicknet-dim font-semibold tracking-wider">ELLER</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-clicknet-border to-transparent" />
        </div>

        {/* Demo button - Premium */}
        <button
          onClick={onLoadDemo}
          className="w-full group flex items-center justify-center gap-4 px-6 py-5 rounded-2xl border border-clicknet-border bg-clicknet-surface hover:bg-clicknet-surface-hover hover:border-clicknet-border-light transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-clicknet-surface-elevated flex items-center justify-center group-hover:bg-clicknet-accent/10 transition-colors">
            <Sparkles size={18} className="text-clicknet-muted group-hover:text-clicknet-accent transition-colors" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold text-clicknet-text">Ladda demo-data</div>
            <div className="text-xs text-clicknet-muted">8 SaaS-leads för att testa systemet</div>
          </div>
          <ArrowRight size={16} className="text-clicknet-dim group-hover:text-clicknet-accent group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </div>
  );
}
