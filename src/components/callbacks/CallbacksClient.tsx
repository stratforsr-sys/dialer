"use client";

import { useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bell, CheckCircle, Trash2, ExternalLink, Clock, AlertCircle } from "lucide-react";
import { completeCallback, deleteCallback } from "@/app/actions/callbacks";

type Callback = {
  id: string;
  scheduledAt: Date | string;
  notes: string | null;
  lead: { id: string; companyName: string };
  user: { id: string; name: string };
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("sv-SE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CallbackRow({
  callback,
  isPast,
  isAdmin,
}: {
  callback: Callback;
  isPast: boolean;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-4 p-4 rounded-[12px]"
      style={{
        background: isPast ? "var(--danger-bg)" : "var(--surface)",
        border: `1px solid ${isPast ? "var(--danger)" : "var(--border)"}`,
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 mt-[1px]"
        style={{ background: isPast ? "var(--danger)" : "var(--accent)", }}
      >
        {isPast ? (
          <AlertCircle size={14} color="white" />
        ) : (
          <Bell size={14} color="white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Link
            href={`/leads/${callback.lead.id}`}
            className="text-[13px] font-semibold hover:underline"
            style={{ color: "var(--text)" }}
          >
            {callback.lead.companyName}
          </Link>
          {isAdmin && (
            <span className="text-[11px] px-2 py-[2px] rounded-full" style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}>
              {callback.user.name}
            </span>
          )}
          {isPast && (
            <span className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>
              Förfallen
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mb-1" style={{ color: "var(--text-dim)" }}>
          <Clock size={11} />
          <span className="text-[11px]">{formatDate(callback.scheduledAt)}</span>
        </div>
        {callback.notes && (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {callback.notes}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => startTransition(() => completeCallback(callback.id))}
          disabled={isPending}
          title="Markera som klar"
          className="flex items-center gap-1 text-[11px] font-medium px-3 py-[5px] rounded-[6px] transition-colors"
          style={{ background: "var(--success-bg)", color: "var(--success)" }}
        >
          <CheckCircle size={12} />
          Klar
        </button>
        <Link
          href={`/leads/${callback.lead.id}`}
          title="Öppna lead"
          className="flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors"
          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          <ExternalLink size={12} />
        </Link>
        <button
          onClick={() => startTransition(() => deleteCallback(callback.id))}
          disabled={isPending}
          title="Ta bort"
          className="flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors"
          style={{ color: "var(--text-dim)" }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
}

export function CallbacksClient({
  past,
  upcoming,
  isAdmin,
}: {
  past: Callback[];
  upcoming: Callback[];
  isAdmin: boolean;
}) {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Bell size={16} color="white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
            Återkomster
          </h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {upcoming.length} kommande · {past.length} förfallna
          </p>
        </div>
      </div>

      {/* Overdue */}
      {past.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--danger)" }}>
            Förfallna ({past.length})
          </p>
          <div className="flex flex-col gap-2">
            {past.map((c) => (
              <CallbackRow key={c.id} callback={c} isPast isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-dim)" }}>
            Kommande ({upcoming.length})
          </p>
          <div className="flex flex-col gap-2">
            {upcoming.map((c) => (
              <CallbackRow key={c.id} callback={c} isPast={false} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      ) : (
        past.length === 0 && (
          <div className="text-center py-16">
            <div
              className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4"
              style={{ background: "var(--surface-inset)" }}
            >
              <Bell size={20} style={{ color: "var(--text-dim)" }} />
            </div>
            <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>
              Inga återkomster
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Sätt återkomster från ett lead för att hålla koll på uppföljningar
            </p>
          </div>
        )
      )}
    </div>
  );
}
