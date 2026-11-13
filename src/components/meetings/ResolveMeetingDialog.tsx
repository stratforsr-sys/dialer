"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, CalendarCheck, PhoneCall, CornerDownLeft } from "lucide-react";
import { DispositionBar } from "@/components/cockpit/DispositionBar";
import { CallbackForm, EMPTY_CALLBACK, type CallbackDraft } from "@/components/cockpit/CallbackForm";
import { RegisterDealModal, type DealDraftData } from "@/components/deals/RegisterDealModal";
import { MeetingForm } from "./MeetingForm";
import { REASON_OPTIONS, type FlowOption } from "@/lib/cockpit-flow";
import {
  emptyMeetingDraft,
  validateMeetingDraft,
  followUpOwnerId,
  KIND_LABELS,
  SAVE_FAILED,
  type MeetingDraft,
  type NoReasonLike,
} from "@/lib/moten";
import { formatWhen, formatTime } from "@/lib/time";
import { resolveMeeting, type ResolveMeetingInput, type MeetingRow } from "@/app/actions/meetings";

/**
 * "Hur gick mötet?" — samma trappa som dispositionen, och av samma skäl.
 *
 * Ett tryck för utfallet, och bara de utfall som behöver något mer frågar
 * vidare: varför nej, eller vad som händer härnäst. Varje väg ut ur rutan
 * säger vad som händer med bolaget, och det står skrivet på knappen innan den
 * trycks — "Återkomsten hamnar hos Fredrik" — för att en säljare som avgör en
 * kollegas möte ska veta vem hen skickar uppgiften till.
 *
 * Avbryter man skrivs ingenting. Mötet står kvar som "utfall saknas".
 */

type Step = "outcome" | "reason" | "next" | "meeting" | "callback" | "deal";

type Picked =
  | { status: "HELD"; outcome: "SALD" }
  | { status: "HELD"; outcome: "NEJ" }
  | { status: "HELD"; outcome: "UPPFOLJNING" }
  | { status: "NO_SHOW" }
  | { status: "CANCELLED" };

const OUTCOME_CHOICES: FlowOption<string>[] = [
  { key: "1", label: "Genomfört — såld", value: "SALD", color: "#22C55E", hint: "Registrera affären" },
  { key: "2", label: "Genomfört — sa nej", value: "NEJ", color: "#EF4444", hint: "Varför?" },
  { key: "3", label: "Genomfört — uppföljning", value: "UPPFOLJNING", color: "#3B82F6", hint: "Nytt möte eller återkomst" },
  { key: "4", label: "Kunden kom inte", value: "NO_SHOW", color: "#F59E0B", hint: "Boka om?" },
  { key: "5", label: "Avbokat", value: "CANCELLED", color: "#6B7280", hint: "Boka om?" },
];

function picked(value: string): Picked {
  switch (value) {
    case "SALD":
      return { status: "HELD", outcome: "SALD" };
    case "NEJ":
      return { status: "HELD", outcome: "NEJ" };
    case "UPPFOLJNING":
      return { status: "HELD", outcome: "UPPFOLJNING" };
    case "NO_SHOW":
      return { status: "NO_SHOW" };
    default:
      return { status: "CANCELLED" };
  }
}

export function ResolveMeetingDialog({
  meeting,
  holders,
  selfId,
  onClose,
  onResolved,
  startWithCancel = false,
}: {
  /** "Avboka" på ett kommande möte: hoppa direkt till nästa steg. */
  startWithCancel?: boolean;
  meeting: MeetingRow;
  holders: Array<{ id: string; name: string }>;
  selfId: string;
  onClose: () => void;
  onResolved: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>(startWithCancel ? "next" : "outcome");
  const [choice, setChoice] = useState<Picked | null>(startWithCancel ? { status: "CANCELLED" } : null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nextMeeting, setNextMeeting] = useState<MeetingDraft>(() => emptyMeetingDraft());
  const [callback, setCallback] = useState<CallbackDraft>(EMPTY_CALLBACK);

  const end = new Date(meeting.scheduledAt.getTime() + meeting.durationMin * 60_000);

  // Vem nästa steg hamnar hos. Samma regel som servern (`followUpOwnerId`):
  // uteblev/avbokat → den som bokade, uppföljning → den som höll mötet.
  const ownerId = choice && choice.status !== "HELD"
    ? followUpOwnerId(
        { status: choice.status, followUp: { type: "release" } },
        { bookedById: meeting.bookedBy.id, holderId: meeting.holder.id }
      )
    : meeting.holder.id;
  const ownerName = ownerId === meeting.holder.id ? meeting.holder.name : meeting.bookedBy.name;
  const ownerText = ownerId === selfId ? "dig" : ownerName;

  const send = useCallback(
    async (input: Omit<ResolveMeetingInput, "meetingId" | "note">, message: string) => {
      setSaving(true);
      setError("");
      try {
        const r = await resolveMeeting({ ...input, meetingId: meeting.id, note: note.trim() || null });
        // Rutan stängs aldrig på ett fel — då är beskedet borta och mötet
        // ser avgjort ut fast det inte är det.
        if (!r.ok) {
          setError(r.error);
          setSaving(false);
          return;
        }
        onResolved(message);
      } catch {
        // Ett kastat fel bär i produktionen bara Nexts engelska standardtext.
        setError(SAVE_FAILED);
        setSaving(false);
      }
    },
    [meeting.id, note, onResolved]
  );

  function pickOutcome(value: string) {
    const p = picked(value);
    setChoice(p);
    setError("");
    if (p.status === "HELD" && p.outcome === "SALD") setStep("deal");
    else if (p.status === "HELD" && p.outcome === "NEJ") setStep("reason");
    else setStep("next");
  }

  function startNewMeeting() {
    setNextMeeting(
      emptyMeetingDraft({
        kind: meeting.kind,
        durationMin: meeting.durationMin,
        location: meeting.location ?? "",
        contactName: meeting.contactName ?? "",
        contactEmail: meeting.contactEmail ?? "",
        contactPhone: meeting.contactPhone ?? "",
        holderId: meeting.holder.id,
      })
    );
    setStep("meeting");
  }

  function back() {
    setError("");
    if (step === "meeting" || step === "callback") setStep("next");
    else if (step === "outcome") onClose();
    else {
      setStep("outcome");
      setChoice(null);
    }
  }

  // Siffrorna som i dispositionen. Fält får sina tangenter själva.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      if (saving || typing) return;
      // Formulären (nytt möte, återkomst, affär) sköter sin egen Escape. Svarar
      // den här också backar rutan två steg på ett tryck.
      if (e.key === "Escape" && step !== "deal" && step !== "meeting" && step !== "callback") {
        e.preventDefault();
        back();
        return;
      }
      if (step === "outcome") {
        const o = OUTCOME_CHOICES.find((x) => x.key === e.key);
        if (o) { e.preventDefault(); pickOutcome(o.value); }
      } else if (step === "reason") {
        const o = REASON_OPTIONS.find((x) => x.key === e.key);
        if (o) { e.preventDefault(); void send({ status: "HELD", outcome: "NEJ", noReason: o.value as NoReasonLike }, "Mötet avgjort — kunden sa nej"); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const statusFor = choice?.status ?? "HELD";
  const outcomeFor = choice?.status === "HELD" ? choice.outcome : null;

  if (step === "deal") {
    return (
      <RegisterDealModal
        leadId={meeting.leadId}
        companyName={meeting.lead.companyName}
        heading="Såld på mötet"
        defaultContactName={meeting.contactName}
        defaultContactEmail={meeting.contactEmail}
        defaultContactPhone={meeting.contactPhone}
        onClose={() => { setStep("outcome"); setChoice(null); }}
        submit={async (d: DealDraftData) => {
          const r = await resolveMeeting({
            meetingId: meeting.id,
            status: "HELD",
            outcome: "SALD",
            note: note.trim() || null,
            deal: {
              contactName: d.contactName,
              contactEmail: d.contactEmail || null,
              contactPhone: d.contactPhone || null,
              valueType: d.valueType,
              value: d.value,
              notes: d.notes || null,
            },
          });
          // Kastat på klienten behåller felet sin text; affärsrutan visar den.
          if (!r.ok) throw new Error(r.error);
        }}
        onCreated={() => onResolved("Affären är registrerad och mötet avgjort")}
      />
    );
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
        className="modal flex flex-col w-full max-w-[560px] max-h-[88vh] overflow-hidden"
        data-testid="resolve-dialog"
      >
        <div className="flex items-start gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {meeting.lead.companyName}
            </p>
            <p className="text-[12px] mt-[2px] mono-nums" style={{ color: "var(--text-muted)" }}>
              {formatWhen(meeting.scheduledAt)}–{formatTime(end)} · {KIND_LABELS[meeting.kind]}
              {meeting.contactName ? ` · ${meeting.contactName}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-sm shrink-0" style={{ color: "var(--text-dim)" }} title="Stäng utan att spara (Esc)">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Anteckning från mötet (valfritt) — hamnar i bolagets historik"
            className="w-full text-[12px] px-3 py-2 rounded-md resize-y"
          />

          {error && (
            <p className="text-[12px]" style={{ color: "var(--danger)" }} data-testid="resolve-error">
              {error}
            </p>
          )}

          {saving ? (
            <p className="text-[12px] py-2 text-center" style={{ color: "var(--text-dim)" }}>Sparar…</p>
          ) : step === "outcome" ? (
            <DispositionBar
              stage="outcome"
              prompt="Hur gick mötet?"
              options={OUTCOME_CHOICES}
              onPick={pickOutcome}
              onBack={back}
              canGoBack={false}
            />
          ) : step === "reason" ? (
            <DispositionBar
              stage="reason"
              options={REASON_OPTIONS}
              onPick={(v) => void send({ status: "HELD", outcome: "NEJ", noReason: v as NoReasonLike }, "Mötet avgjort — kunden sa nej")}
              onBack={back}
              canGoBack
            />
          ) : step === "next" ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={back} className="btn-ghost btn-sm">Ångra</button>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                  Vad händer nu?
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <NextButton
                  icon={<CalendarCheck size={14} />}
                  title="Boka ett nytt möte"
                  hint={`Bolaget stannar utanför ringlistan och låses till ${meeting.holder.id === selfId ? "dig" : meeting.holder.name}`}
                  onClick={startNewMeeting}
                />
                <NextButton
                  icon={<PhoneCall size={14} />}
                  title="Ring upp"
                  hint={`En återkomst hamnar i klockan hos ${ownerText}`}
                  onClick={() => { setCallback(EMPTY_CALLBACK); setStep("callback"); }}
                />
                {choice?.status !== "HELD" && (
                  <NextButton
                    icon={<CornerDownLeft size={14} />}
                    title="Släpp till ringlistan"
                    hint="Inget nytt möte och ingen återkomst — bolaget går tillbaka i kön för hela golvet"
                    onClick={() =>
                      void send(
                        { status: statusFor as "NO_SHOW" | "CANCELLED", followUp: { type: "release" } },
                        "Mötet avgjort — bolaget är tillbaka i ringlistan"
                      )
                    }
                  />
                )}
              </div>
            </div>
          ) : step === "meeting" ? (
            <MeetingForm
              title="Nytt möte"
              saveLabel="Boka och avgör"
              draft={nextMeeting}
              onChange={setNextMeeting}
              holders={holders}
              selfId={selfId}
              excludeMeetingId={meeting.id}
              onCancel={back}
              onSave={() => {
                if (Object.keys(validateMeetingDraft(nextMeeting)).length > 0) return;
                void send(
                  {
                    status: statusFor,
                    outcome: outcomeFor,
                    followUp: {
                      type: "meeting",
                      at: new Date(nextMeeting.at).toISOString(),
                      durationMin: nextMeeting.durationMin,
                      kind: nextMeeting.kind,
                      location: nextMeeting.location.trim() || null,
                      note: nextMeeting.note.trim() || null,
                      holderId: nextMeeting.holderId || null,
                    },
                  },
                  `Nytt möte bokat ${formatWhen(new Date(nextMeeting.at))}`
                );
              }}
            />
          ) : (
            <div>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-dim)" }}>
                Återkomsten hamnar hos {ownerText}.
              </p>
              <CallbackForm
                draft={callback}
                onChange={setCallback}
                onCancel={back}
                onSave={() => {
                  const at = callback.at ? new Date(callback.at) : null;
                  if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
                  void send(
                    {
                      status: statusFor,
                      outcome: outcomeFor,
                      followUp: {
                        type: "callback",
                        at: at.toISOString(),
                        note: callback.note.trim() || null,
                        emailReminder: callback.emailReminder,
                      },
                    },
                    `Återkomst bokad ${formatWhen(at)}`
                  );
                }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function NextButton({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-[10px] text-left rounded-md"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <span className="mt-[1px]" style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>{title}</span>
        <span className="block text-[11px] mt-[1px]" style={{ color: "var(--text-dim)" }}>{hint}</span>
      </span>
    </button>
  );
}
