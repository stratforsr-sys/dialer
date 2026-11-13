"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, AlertTriangle, Video, MapPin, Phone } from "lucide-react";
import {
  KIND_OPTIONS,
  DURATION_OPTIONS,
  validateMeetingDraft,
  nextWorkdays,
  joinDateTime,
  splitDateTime,
  conflictsFor,
  meetingEnd,
  type MeetingDraft,
  type MeetingKindLike,
} from "@/lib/moten";
import { formatWhen, formatTime } from "@/lib/time";

/**
 * Mötesrutan. Öppnas av `5 Möte bokat` i cockpiten och i notisklockans
 * dispositionsruta, och av "Nytt möte" när ett möte avgörs.
 *
 * Kunden är kvar i luren medan den fylls i, så ordningen är den ordning
 * samtalet tar: NÄR (dag + klockslag), HUR LÄNGE och VAR, MED VEM. Allt som
 * kan förifyllas är förifyllt — kontakten från kortet säljaren ringde, adressen
 * från bolaget när mötet är fysiskt, och säljaren själv som den som håller det.
 *
 * Det som syns direkt är en mening som byggs medan man fyller i — "tis 17 nov
 * 10:00–10:30 · Teams / video · med Anna". Det är samma mening som säljaren
 * ska läsa upp som bekräftelse innan luren läggs på, och den är det enklaste
 * sättet att se ett fel i dag eller tid innan det sparas.
 *
 * Krockar hos den som håller mötet varnas, men stoppar aldrig: en bokning som
 * stoppas medan kunden väntar är värre än en dubbelbokning som syns.
 */

const KIND_ICON: Record<MeetingKindLike, typeof Video> = {
  DIGITALT: Video,
  FYSISKT: MapPin,
  TELEFON: Phone,
};

interface Busy {
  id: string;
  scheduledAt: Date;
  durationMin: number;
  status: "BOOKED";
  label: string;
}

export function MeetingForm({
  draft,
  onChange,
  onSave,
  onCancel,
  holders,
  selfId,
  leadAddress = null,
  saving = false,
  title = "Möte bokat",
  saveLabel = "Spara mötet",
  excludeMeetingId = null,
}: {
  draft: MeetingDraft;
  onChange: (next: MeetingDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  holders: Array<{ id: string; name: string }>;
  selfId: string;
  /** Förifylls som plats när säljaren väljer ett fysiskt möte. */
  leadAddress?: string | null;
  saving?: boolean;
  title?: string;
  saveLabel?: string;
  /** Mötet som bokas om — ska inte krocka med sig självt. */
  excludeMeetingId?: string | null;
}) {
  // Dagvalen räknas en gång per öppning, som återkomstens snabbval: räknas de
  // om vid varje rendering kan "I dag" bli "I morgon" mitt i en bokning.
  const days = useMemo(() => nextWorkdays(new Date(), 6), []);
  const { date, time } = splitDateTime(draft.at);
  const timeRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  const errors = validateMeetingDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const start = draft.at ? new Date(draft.at) : null;
  const startOk = start !== null && !Number.isNaN(start.getTime());

  // ── Krockar hos hållaren ──────────────────────────────────────────────
  const [busy, setBusy] = useState<Busy[]>([]);
  useEffect(() => {
    if (!date || !draft.holderId) {
      setBusy([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // Hela dagen i lokal tid, så att samma fråga gäller oavsett klockslag
        // — då hämtas den inte om för varje siffra som skrivs i tidsfältet.
        const from = new Date(`${date}T00:00`);
        const to = new Date(from.getTime() + 86_400_000);
        const q = new URLSearchParams({
          holderId: draft.holderId,
          from: from.toISOString(),
          to: to.toISOString(),
        });
        if (excludeMeetingId) q.set("exclude", excludeMeetingId);
        const res = await fetch(`/api/meetings/busy?${q}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { meetings: Array<Omit<Busy, "scheduledAt"> & { scheduledAt: string }> };
        setBusy(body.meetings.map((m) => ({ ...m, scheduledAt: new Date(m.scheduledAt) })));
      } catch {
        // Varningen är en hjälp, inte en förutsättning. Går frågan inte fram
        // bokas mötet ändå.
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [date, draft.holderId, excludeMeetingId]);

  const clashes = startOk
    ? conflictsFor({ scheduledAt: start!, durationMin: draft.durationMin }, busy)
    : [];

  function set<K extends keyof MeetingDraft>(key: K, value: MeetingDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function pickDay(d: string) {
    // Klockslaget står kvar när dagen byts — "nej, onsdag i stället" ska inte
    // kräva att tiden skrivs om.
    onChange({ ...draft, at: joinDateTime(d, time || "10:00") });
    // Markören till klockslaget: det är nästa sak kunden säger.
    requestAnimationFrame(() => timeRef.current?.select());
  }

  function pickKind(kind: MeetingKindLike) {
    // Adressen förifylls bara när platsen är tom eller fortfarande är den
    // förifyllda — säljaren som skrivit en egen adress ska inte få den
    // överskriven av ett klick på en annan sort och tillbaka.
    const wasPrefill = !draft.location || draft.location === leadAddress;
    const location =
      kind === "FYSISKT" && wasPrefill && leadAddress
        ? leadAddress
        : kind !== "FYSISKT" && draft.location === leadAddress
          ? ""
          : draft.location;
    onChange({ ...draft, kind, location });
  }

  function trySave() {
    setTouched(true);
    if (valid && !saving) onSave();
  }

  // Enter sparar från alla fält utom anteckningen, Escape backar. Händelsen
  // stoppas här: cockpitens globala lyssnare släpper bara igenom inmatnings-
  // fält, och en siffra på en dagknapp hade annars valt ett utfall bakom rutan.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      e.stopPropagation();
      trySave();
    }
  }

  const kindOpt = KIND_OPTIONS.find((k) => k.value === draft.kind) ?? KIND_OPTIONS[0];
  const holderName = holders.find((h) => h.id === draft.holderId)?.name;
  const showErr = (k: keyof typeof errors) => touched && errors[k];

  const label = "text-[10px] font-semibold uppercase tracking-widest mb-1 block";
  const field = "w-full px-3 py-2 text-[13px] rounded-md outline-none";

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
      onKeyDown={onKeyDown}
      data-testid="meeting-form"
    >
      {/* Rubrik + den levande meningen */}
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <CalendarCheck size={13} style={{ color: "#6366F1" }} className="shrink-0" />
        <p className="text-[11px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--text-dim)" }}>
          {title}
        </p>
        <span
          className="text-[12px] ml-auto truncate mono-nums"
          style={{ color: startOk && !errors.at ? "var(--text)" : "var(--text-dim)" }}
          data-testid="meeting-summary"
        >
          {startOk && !errors.at ? (
            <>
              {formatWhen(start!)}–{formatTime(meetingEnd({ scheduledAt: start!, durationMin: draft.durationMin }))}
              {" · "}
              {kindOpt.label}
              {draft.contactName.trim() ? ` · med ${draft.contactName.trim()}` : ""}
              {holderName && draft.holderId !== selfId ? ` · ${holderName} håller` : ""}
            </>
          ) : (
            "Välj dag och tid"
          )}
        </span>
      </div>

      {/* NÄR */}
      <div className="flex flex-wrap items-center gap-[6px] mb-2">
        {days.map((d) => {
          const active = date === d.date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => pickDay(d.date)}
              className="text-[12px] font-medium px-[10px] py-[5px] rounded-md"
              style={{
                background: active ? "var(--accent-muted)" : "var(--surface)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
              }}
            >
              {d.label}
            </button>
          );
        })}
        <input
          type="date"
          value={date}
          onChange={(e) => onChange({ ...draft, at: joinDateTime(e.target.value, time || "10:00") })}
          aria-label="Datum"
          className="px-2 py-[4px] text-[12px] rounded-md mono-nums"
          style={{ background: "var(--surface)" }}
        />
        <input
          ref={timeRef}
          type="time"
          step={300}
          value={time}
          onChange={(e) => onChange({ ...draft, at: joinDateTime(date || days[0]?.date || "", e.target.value) })}
          aria-label="Klockslag"
          autoFocus
          className="px-2 py-[4px] text-[13px] font-semibold rounded-md mono-nums"
          style={{
            background: "var(--surface)",
            borderColor: showErr("at") ? "var(--danger-border)" : undefined,
          }}
        />
      </div>
      {(showErr("at") || (startOk && errors.at)) && (
        <p className="flex items-center gap-1 text-[11px] mb-2" style={{ color: "var(--danger)" }}>
          <AlertTriangle size={11} /> {errors.at}
        </p>
      )}

      {/* HUR LÄNGE + VAR */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="segmented" role="radiogroup" aria-label="Längd">
          {DURATION_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              role="radio"
              aria-checked={draft.durationMin === min}
              onClick={() => set("durationMin", min)}
              className={`segmented-item mono-nums ${draft.durationMin === min ? "active" : ""}`}
            >
              {min}
            </button>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>min</span>
        <div className="segmented ml-auto" role="radiogroup" aria-label="Typ av möte">
          {KIND_OPTIONS.map((k) => {
            const Icon = KIND_ICON[k.value];
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={draft.kind === k.value}
                onClick={() => pickKind(k.value)}
                className={`segmented-item flex items-center gap-1 ${draft.kind === k.value ? "active" : ""}`}
              >
                <Icon size={11} /> {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-2">
        <input
          type="text"
          value={draft.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder={`${kindOpt.locationLabel} — ${kindOpt.locationPlaceholder.toLowerCase()}`}
          aria-label={kindOpt.locationLabel}
          maxLength={500}
          className={field}
          style={{ background: "var(--surface)" }}
        />
      </div>

      {/* MED VEM */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={label} style={{ color: "var(--text-dim)" }}>Med</label>
          <input
            type="text"
            value={draft.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Kontaktperson"
            maxLength={200}
            className={field}
            style={{
              background: "var(--surface)",
              borderColor: showErr("contactName") ? "var(--danger-border)" : undefined,
            }}
          />
        </div>
        <div>
          <label className={label} style={{ color: "var(--text-dim)" }}>E-post — för inbjudan</label>
          <input
            type="email"
            value={draft.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
            placeholder="namn@bolag.se"
            maxLength={200}
            className={field}
            style={{
              background: "var(--surface)",
              borderColor: showErr("contactEmail") ? "var(--danger-border)" : undefined,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
        <div>
          <label className={label} style={{ color: "var(--text-dim)" }}>Håller mötet</label>
          <select
            value={draft.holderId}
            onChange={(e) => set("holderId", e.target.value)}
            className={field}
            style={{ background: "var(--surface)" }}
          >
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.id === selfId ? `${h.name} (jag)` : h.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} style={{ color: "var(--text-dim)" }}>Vad ska mötet handla om?</label>
          <input
            type="text"
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Valfritt — följer med till kalendern"
            maxLength={2000}
            className={field}
            style={{ background: "var(--surface)" }}
          />
        </div>
      </div>

      {clashes.length > 0 && (
        <p
          className="flex items-start gap-1.5 text-[11px] mt-2 leading-[1.45]"
          style={{ color: "var(--warning)" }}
          data-testid="meeting-clash"
        >
          <AlertTriangle size={11} className="mt-[2px] shrink-0" />
          <span>
            {holderName && draft.holderId !== selfId ? `${holderName} har` : "Du har"} redan{" "}
            {clashes
              .map((c) => `${formatTime(c.scheduledAt)}–${formatTime(meetingEnd(c))} ${c.label}`)
              .join(", ")}
            . Det går att boka ändå.
          </span>
        </p>
      )}

      {touched && !valid && !errors.at && (
        <p className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>
          {Object.values(errors).join(" · ")}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">
          Avbryt
        </button>
        <button
          type="button"
          onClick={trySave}
          disabled={saving}
          className="btn-primary btn-sm"
          data-testid="meeting-save"
        >
          {saving ? "Sparar…" : `${saveLabel} ↵`}
        </button>
      </div>
    </div>
  );
}
