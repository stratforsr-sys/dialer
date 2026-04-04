"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { X, Calendar } from "lucide-react";
import { bookMeeting } from "@/app/actions/meetings";

export function BookMeetingModal({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) return;
    const scheduledAt = new Date(`${date}T${time}`);
    if (isNaN(scheduledAt.getTime())) {
      setError("Ogiltigt datum/tid");
      return;
    }
    startTransition(async () => {
      try {
        await bookMeeting(leadId, scheduledAt, title || undefined, notes || undefined);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Något gick fel");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px]"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "18px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Boka möte</h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{leadName}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "var(--surface-inset)" }}>
            <X size={14} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-[5px]">
              <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Datum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
                style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
            </div>
            <div className="flex flex-col gap-[5px]">
              <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tid</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
                style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-[5px]">
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Titel (valfritt)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Demo, Presentationsmöte..."
              className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
          </div>

          <div className="flex flex-col gap-[5px]">
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Anteckningar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Agenda, förberedelser..."
              className="text-[13px] outline-none px-3 py-2 rounded-[8px] resize-none"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
          </div>

          {error && <p className="text-[12px] px-3 py-2 rounded-[8px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-[13px] font-medium rounded-[8px]"
              style={{ background: "var(--surface-inset)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              Avbryt
            </button>
            <button type="submit" disabled={isPending || !date || !time} className="flex-1 py-2 text-[13px] font-medium rounded-[8px] flex items-center justify-center gap-2"
              style={{ background: "var(--accent)", color: "white", opacity: isPending || !date || !time ? 0.6 : 1 }}>
              <Calendar size={13} />
              {isPending ? "Bokar..." : "Boka möte"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
