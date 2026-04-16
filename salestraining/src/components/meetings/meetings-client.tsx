"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface Meeting {
  id: string;
  date: string;
  meetingType: string;
  summary: string | null;
  talkRatio: number | null;
  questionsAsked: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  meeting_1: "Möte 1 — Behovsanalys",
  meeting_2: "Möte 2 — Offert",
  meeting_3: "Möte 3 — Beslut",
};

export function MeetingsClient({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="max-w-4xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      <div className="flex items-center justify-between mb-[var(--space-8)]">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            Mötesanalys
          </h1>
          <p className="mt-[var(--space-1)] text-sm" style={{ color: "var(--text-tertiary)" }}>
            Ladda upp transkript från riktiga möten — AI:n hittar tekniker du använde och missade.
          </p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Nytt möte
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-[var(--space-16)] text-center"
          style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-xl)",
            border: "1px dashed var(--border-default)",
          }}
        >
          <div
            className="w-16 h-16 flex items-center justify-center mb-[var(--space-5)]"
            style={{ background: "rgba(245, 158, 11, 0.08)", borderRadius: "var(--radius-xl)" }}
          >
            <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="var(--warning)" strokeWidth="1.5">
              <rect x="5.5" y="2" width="5" height="8" rx="2.5" />
              <path d="M3 8.5c0 2.5 2 4.5 5 4.5s5-2 5-4.5" /><path d="M8 13v2" />
            </svg>
          </div>
          <h3 className="font-heading text-xl font-semibold mb-[var(--space-2)]" style={{ color: "var(--text-primary)" }}>
            Inga möten analyserade
          </h3>
          <p className="text-sm max-w-xs mb-[var(--space-6)]" style={{ color: "var(--text-tertiary)" }}>
            Ladda upp ett transkript för att se vilka tekniker du använde och vilka du missade.
          </p>
          <Link
            href="/meetings/new"
            className="px-[var(--space-5)] py-[var(--space-3)] text-sm font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              borderRadius: "var(--radius-md)",
            }}
          >
            Ladda upp transkript
          </Link>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="flex flex-col gap-[var(--space-3)]"
        >
          {meetings.map((m) => (
            <motion.div
              key={m.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
              }}
            >
              <Link href={`/meetings/${m.id}`} className="card flex items-center gap-[var(--space-5)] px-[var(--space-6)] py-[var(--space-5)]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {TYPE_LABELS[m.meetingType] || m.meetingType}
                  </div>
                  <div className="text-xs mt-[2px] line-clamp-1" style={{ color: "var(--text-tertiary)" }}>
                    {m.summary || "Ingen sammanfattning"}
                  </div>
                </div>

                <div className="flex items-center gap-[var(--space-4)] flex-shrink-0">
                  {m.talkRatio != null && (
                    <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {Math.round(m.talkRatio)}% talk
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {new Date(m.date).toLocaleDateString("sv-SE")}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
