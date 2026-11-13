"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MeetingForm } from "./MeetingForm";
import { emptyMeetingDraft, validateMeetingDraft, type MeetingDraft } from "@/lib/moten";
import { toDatetimeLocalValue } from "@/lib/time";
import { updateMeeting, type MeetingRow } from "@/app/actions/meetings";

/**
 * Flytta eller ändra ett bokat möte — samma ruta som bokningen.
 *
 * Kunden ringer och vill byta dag, Teams-länken kom efter samtalet, en kollega
 * tar över mötet. Raden behålls; en ny tid räknas som en flytt och loggas på
 * bolaget (`updateMeeting`).
 */
export function EditMeetingDialog({
  meeting,
  holders,
  selfId,
  onClose,
  onSaved,
}: {
  meeting: MeetingRow;
  holders: Array<{ id: string; name: string }>;
  selfId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<MeetingDraft>(() =>
    emptyMeetingDraft({
      at: toDatetimeLocalValue(meeting.scheduledAt),
      durationMin: meeting.durationMin,
      kind: meeting.kind,
      location: meeting.location ?? "",
      note: meeting.note ?? "",
      contactName: meeting.contactName ?? "",
      contactEmail: meeting.contactEmail ?? "",
      contactPhone: meeting.contactPhone ?? "",
      holderId: meeting.holder.id,
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (Object.keys(validateMeetingDraft(draft)).length > 0) return;
    setSaving(true);
    setError("");
    try {
      const at = new Date(draft.at);
      await updateMeeting(meeting.id, {
        at: at.toISOString(),
        durationMin: draft.durationMin,
        kind: draft.kind,
        location: draft.location,
        note: draft.note,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        holderId: draft.holderId,
      });
      onSaved(at.getTime() !== meeting.scheduledAt.getTime() ? "Mötet är flyttat" : "Mötet är ändrat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: "rgba(16, 24, 40, 0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.12 }}
        role="dialog"
        aria-modal="true"
        className="modal w-full max-w-[560px] max-h-[88vh] overflow-y-auto p-4"
        data-testid="edit-dialog"
      >
        <p className="text-[15px] font-semibold mb-3 truncate" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
          {meeting.lead.companyName}
        </p>
        {error && (
          <p className="text-[12px] mb-2" style={{ color: "var(--danger)" }}>{error}</p>
        )}
        <MeetingForm
          title="Ändra mötet"
          saveLabel="Spara ändringen"
          draft={draft}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={onClose}
          holders={holders}
          selfId={selfId}
          saving={saving}
          excludeMeetingId={meeting.id}
        />
      </motion.div>
    </div>
  );
}
