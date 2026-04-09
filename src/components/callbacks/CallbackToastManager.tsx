"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { completeCallback } from "@/app/actions/callbacks";

type DueCallback = {
  id: string;
  scheduledAt: Date | string;
  notes: string | null;
  lead: { id: string; companyName: string };
};

// Shown toasts are tracked so we don't re-show them in the same session
const shownIds = new Set<string>();

export function CallbackToastManager() {
  const [toasts, setToasts] = useState<DueCallback[]>([]);
  const [isPending, startTransition] = useTransition();

  const fetchDue = useCallback(async () => {
    try {
      const res = await fetch("/api/callbacks/due");
      if (!res.ok) return;
      const data: DueCallback[] = await res.json();
      const newToasts = data.filter((c) => !shownIds.has(c.id));
      if (newToasts.length > 0) {
        newToasts.forEach((c) => shownIds.add(c.id));
        setToasts((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          return [...prev, ...newToasts.filter((c) => !existingIds.has(c.id))];
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDue();
    const interval = setInterval(fetchDue, 60_000); // check every minute
    return () => clearInterval(interval);
  }, [fetchDue]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleComplete(id: string) {
    startTransition(async () => {
      await completeCallback(id);
      dismiss(id);
    });
  }

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const time = new Date(toast.scheduledAt).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto w-[320px] rounded-[12px] overflow-hidden"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: "var(--accent)", borderRadius: "12px 12px 0 0" }}
              >
                <div className="flex items-center gap-2">
                  <Bell size={13} color="white" />
                  <span className="text-[12px] font-semibold text-white">Återkomst — {time}</span>
                </div>
                <button onClick={() => dismiss(toast.id)}>
                  <X size={13} color="rgba(255,255,255,0.8)" />
                </button>
              </div>

              {/* Body */}
              <div className="px-4 py-3">
                <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>
                  {toast.lead.companyName}
                </p>
                {toast.notes && (
                  <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
                    {toast.notes}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleComplete(toast.id)}
                    disabled={isPending}
                    className="flex items-center gap-1 text-[11px] font-semibold px-3 py-[5px] rounded-[6px]"
                    style={{ background: "var(--success-bg)", color: "var(--success)" }}
                  >
                    <CheckCircle size={11} />
                    Klar
                  </button>
                  <Link
                    href={`/leads/${toast.lead.id}`}
                    className="flex items-center gap-1 text-[11px] font-medium px-3 py-[5px] rounded-[6px]"
                    style={{ background: "var(--surface-inset)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    onClick={() => dismiss(toast.id)}
                  >
                    <ExternalLink size={11} />
                    Öppna lead
                  </Link>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="ml-auto text-[11px] font-medium px-2 py-[5px] rounded-[6px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Stäng
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
