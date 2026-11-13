"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, X } from "lucide-react";
import { formatWhen, formatTime } from "@/lib/time";
import { MeetingCalendarLinks } from "./MeetingCalendarLinks";
import type { CalendarMeeting } from "@/lib/kalender";

/**
 * Kvittot efter ett bokat möte.
 *
 * Cockpiten går vidare till nästa bolag i samma sekund som mötet sparas —
 * skriv-bakom-kön är hela poängen. Kvittot är därför det enda stället där
 * säljaren ser mötet igen innan nästa samtal, och det bär det enda hen kan
 * behöva göra med det direkt: lägga det i kalendern och skicka inbjudan.
 *
 * Står kvar i tjugo sekunder — längre än en vanlig toast, för att länken ska
 * hinnas med mellan två samtal — och längre så länge pekaren är över den.
 * Skuggnivå 4: den ligger i handen, över allt annat.
 */
export function MeetingBookedToast({
  meeting,
  onClose,
}: {
  meeting: (CalendarMeeting & { key: number }) | null;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!meeting || hover) return;
    const t = setTimeout(onClose, 20_000);
    return () => clearTimeout(t);
  }, [meeting, hover, onClose]);

  return (
    <AnimatePresence>
      {meeting && (
        <motion.div
          key={meeting.key}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[55] w-[440px] max-w-[calc(100vw-32px)] rounded-lg p-3.5"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-4)",
          }}
          data-testid="meeting-toast"
        >
          <div className="flex items-start gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ background: "#6366F11A", border: "1px solid #6366F133" }}
            >
              <CalendarCheck size={14} style={{ color: "#6366F1" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
                Möte bokat med {meeting.companyName}
              </p>
              <p className="text-[12px] mono-nums" style={{ color: "var(--text-muted)" }}>
                {formatWhen(meeting.start)}–
                {formatTime(new Date(meeting.start.getTime() + meeting.durationMin * 60_000))}
                {" · "}
                {meeting.kindLabel}
                {meeting.holderName ? ` · ${meeting.holderName} håller` : ""}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                  Lägg i kalendern
                </span>
                <MeetingCalendarLinks meeting={meeting} size="xs" />
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-sm shrink-0"
              style={{ color: "var(--text-dim)" }}
              aria-label="Stäng"
            >
              <X size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
