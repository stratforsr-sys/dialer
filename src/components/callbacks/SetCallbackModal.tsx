"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Clock } from "lucide-react";
import { createCallback } from "@/app/actions/callbacks";

interface SetCallbackModalProps {
  leadId: string;
  companyName: string;
  onClose: () => void;
  onCreated?: () => void;
}

const QUICK_OPTIONS = [
  { label: "Om 30 min", minutes: 30 },
  { label: "Om 1 timme", minutes: 60 },
  { label: "Om 2 timmar", minutes: 120 },
  { label: "Imorgon 09:00", type: "tomorrow" as const },
];

function getTomorrow9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SetCallbackModal({
  leadId,
  companyName,
  onClose,
  onCreated,
}: SetCallbackModalProps) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [dateValue, setDateValue] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // default: 1h from now
    return toLocalDatetimeValue(d);
  });

  function applyQuick(opt: (typeof QUICK_OPTIONS)[number]) {
    if (opt.type === "tomorrow") {
      setDateValue(toLocalDatetimeValue(getTomorrow9am()));
    } else {
      const d = new Date(Date.now() + opt.minutes * 60 * 1000);
      setDateValue(toLocalDatetimeValue(d));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dateValue) return;
    const scheduledAt = new Date(dateValue);
    startTransition(async () => {
      await createCallback(leadId, scheduledAt, notes || undefined);
      onCreated?.();
      onClose();
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="w-[400px] rounded-[16px] overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Bell size={15} style={{ color: "var(--accent)" }} />
              <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                Sätt återkomst
              </span>
            </div>
            <button onClick={onClose} style={{ color: "var(--text-dim)" }}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
            {/* Company name */}
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Återkomst för{" "}
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {companyName}
              </span>
            </p>

            {/* Quick picks */}
            <div className="flex flex-wrap gap-2">
              {QUICK_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => applyQuick(opt)}
                  className="text-[11px] font-medium px-3 py-[5px] rounded-full transition-colors"
                  style={{
                    background: "var(--surface-inset)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Date/time picker */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                <Clock size={11} /> Datum & tid
              </label>
              <input
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                required
                className="w-full text-[13px] outline-none px-3 py-2 rounded-[8px]"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
                Anteckning (valfri)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Vad ska du följa upp på?"
                rows={2}
                className="w-full text-[12px] outline-none px-3 py-2 rounded-[8px] resize-none"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-[13px] font-medium rounded-[8px] transition-colors"
                style={{
                  background: "var(--surface-inset)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={isPending || !dateValue}
                className="flex-1 py-2 text-[13px] font-semibold rounded-[8px] transition-opacity"
                style={{
                  background: "var(--accent)",
                  color: "white",
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? "Sparar..." : "Spara återkomst"}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
