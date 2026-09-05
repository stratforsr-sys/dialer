"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Phone, Clock } from "lucide-react";
import { DispositionBar } from "@/components/cockpit/DispositionBar";
import { FrameworkTap } from "@/components/cockpit/FrameworkPanel";
import { CallbackForm, EMPTY_CALLBACK, type CallbackDraft } from "@/components/cockpit/CallbackForm";
import { RegisterDealModal } from "@/components/deals/RegisterDealModal";
import {
  RESULT_OPTIONS,
  NO_PHONE_FOUND,
  GATEKEEPER_OPTIONS,
  OUTCOME_OPTIONS,
  REASON_OPTIONS,
  INITIAL_FLOW,
  stageAfterResult,
  stageAfterOutcome,
  shouldAskFramework,
  optionForKey,
  type FlowState,
} from "@/lib/cockpit-flow";
import { formatWhen } from "@/lib/time";
import type { CallbackRow } from "@/app/actions/callbacks";
import type {
  CallResult,
  ConversationOutcome,
  NoReason,
  FrameworkStep,
} from "@/generated/prisma/client";

/**
 * Dispositionsrutan för en återkomst.
 *
 * Varför den finns: ett bolag med en öppen återkomst ligger utanför däcket
 * (`leaseNextLeads`). Det serveras inte till någon — inte ens till säljaren
 * som lovade — eftersom ett lovat samtal inte är ett slumpmässigt nästa lead.
 * Men då måste utfallet gå att registrera någon annanstans än i cockpiten,
 * annars vore fixen bara ett sätt att gömma bolaget. Här är den platsen.
 *
 * Trappan är EXAKT cockpitens: samma `cockpit-flow`, samma `DispositionBar`,
 * samma bokningsruta, samma affärsruta, samma ramverksfråga. Det är ett
 * medvetet val framför en kortare variant — två dispositionsflöden som ser
 * lika ut men skiljer sig i ett steg ger statistik som inte går att jämföra,
 * och en säljare som måste lära sig två uppsättningar tangenter.
 *
 * Skillnaden mot cockpiten är att raden pekas ut: `answeredCallbackId` skickas
 * med, så att just den här återkomsten stängs även om säljaren ringde tio
 * minuter före utsatt tid. Tidsjämförelsen ensam hade lämnat den öppen.
 *
 * Avbryter man skrivs INGENTING. Samma regel som affärsrutan i cockpiten:
 * en halv disposition är värre än ingen.
 */

/** Hur många gånger skrivningen skickas om innan säljaren får ett besked. */
const MAX_FORSOK = 4;
/** Väntetid före nästa försök. Kort — säljaren står och tittar på knappen. */
const BACKOFF_MS = [400, 1200, 3000];

const SESSION_UTGANGEN = "Sessionen har gått ut — ladda om sidan och logga in igen.";

/**
 * Skickar dispositionen och väntar ut svaret, med omförsök.
 *
 * Rutan hade fram till 2026-09-05 ett ensamt `fetch` utan omförsök och utan
 * skydd mot en utgången session. Två fel följde av det, och båda drabbade
 * **lovade** samtal — alltså exakt de som inte får tappas:
 *
 * **Ett serverfel var slutstation.** En transaktion som timade ut under
 * belastning gav "Kunde inte spara samtalet" och säljaren fick trycka om för
 * hand. Cockpitens kö fick omförsök den 4 september; den här vägen fick det
 * inte, trots att det är här återkomsterna dispositioneras.
 *
 * **En utgången session räknades som en lyckad skrivning.** Utan
 * `redirect: "manual"` följer webbläsaren middlewares omdirigering till
 * inloggningen och får HTML tillbaka med status 200. `res.ok` blev sant,
 * `res.json()` fallerade tyst till `null`, ingen post såg misslyckad ut — och
 * rutan stängdes med `onDone()` som om löftet var infriat. Ingenting skrevs.
 * Det är samma fälla som `useDispositionQueue` har en egen kommentar om sedan
 * länge; den här filen hade bara aldrig fått samma skydd.
 */
async function postDisposition(
  item: Record<string, unknown>,
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError = "Kunde inte spara samtalet. Försök igen.";

  for (let forsok = 0; forsok < MAX_FORSOK; forsok++) {
    if (forsok > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[forsok - 1] ?? 3000));
    }

    const res = await fetch("/api/dispositions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [item] }),
      redirect: "manual",
    });

    // Utgången session. Att skicka om löser ingenting — säljaren måste logga in.
    if (
      res.type === "opaqueredirect" ||
      (res.status >= 300 && res.status < 400) ||
      res.status === 401
    ) {
      return { ok: false, error: SESSION_UTGANGEN };
    }

    // 4xx som inte är 408/429 är vårt eget fel på indata och blir inte bättre
    // av ett nytt försök.
    if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      return { ok: false, error: `Servern nekade skrivningen (${res.status}).` };
    }

    if (!res.ok) {
      lastError = `Servern svarade ${res.status}.`;
      continue;
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      // HTML tillbaka på en 200 betyder i praktiken inloggningssidan.
      return { ok: false, error: SESSION_UTGANGEN };
    }

    const body = (await res.json()) as {
      results?: Array<{ key: string; ok: boolean; error?: string; retryable?: boolean }>;
    };
    const result = body.results?.find((r) => r.key === key) ?? body.results?.[0];

    // Inget resultat för nyckeln är inget kvitto. Hellre ett omförsök —
    // skrivningen är idempotent och kostar ett uppslag om den redan gjorts.
    if (!result) {
      lastError = "Oväntat svar från servern.";
      continue;
    }
    if (result.ok) return { ok: true };

    lastError = result.error ?? lastError;
    if (result.retryable !== true) return { ok: false, error: lastError };
  }

  return { ok: false, error: lastError };
}

export function CallbackDisposition({
  row,
  onDone,
  onClose,
}: {
  row: CallbackRow;
  /** Anropas när samtalet är skrivet. Klockan hämtar om sin lista. */
  onDone: () => void;
  onClose: () => void;
}) {
  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW);
  const [notes, setNotes] = useState("");
  const [callback, setCallback] = useState<CallbackDraft>(EMPTY_CALLBACK);
  const [askCallback, setAskCallback] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [endedAtStep, setEndedAtStep] = useState<FrameworkStep | null>(null);
  const [closeAttempts, setCloseAttempts] = useState(0);
  const [objections, setObjections] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Idempotensnyckeln för den här rutan — EN nyckel, inte en per försök.
   *
   * Fram till 2026-09-05 genererades den inne i `commit`, alltså på nytt vid
   * varje tryck. Det gjorde nyckeln verkningslös i precis det läge den finns
   * för: gick skrivningen igenom men svaret tappades på vägen, skrev nästa
   * tryck ett andra samtal på bolaget i stället för att få "redan gjort"
   * tillbaka. Det är samma mönster som lämnade fem försök i rad på ett bolag
   * den 4 september.
   *
   * Nyckeln följer rutan, inte försöket. Ändrar säljaren sig om utfallet efter
   * ett fel är det fortfarande rätt: hade det första verkligen fallerat finns
   * ingen rad att krocka med, och hade det gått igenom är samtalet redan
   * bokfört och ska inte skrivas två gånger.
   */
  const keyRef = useRef<string>("");
  if (!keyRef.current) keyRef.current = crypto.randomUUID();

  // ── Skrivningen ─────────────────────────────────────────────────────────
  const commit = useCallback(
    async (opts: {
      result: CallResult;
      outcome?: ConversationOutcome | null;
      noReason?: NoReason | null;
      withFramework?: boolean;
    }) => {
      setSaving(true);
      setError("");
      try {
        const res = await postDisposition(
          {
            idempotencyKey: keyRef.current,
            leadId: row.leadId,
            contactId: row.contactId,
            result: opts.result,
            outcome: opts.outcome ?? null,
            noReason: opts.noReason ?? null,
            note: notes.trim() || null,
            dialedE164: row.phone,
            // Raden det här samtalet svarade på. Utan den stängs inte en
            // återkomst som ringdes före utsatt tid.
            answeredCallbackId: row.id,
            callbackAt: callback.at ? new Date(callback.at).toISOString() : null,
            callbackNote: callback.note.trim() || null,
            callbackEmailReminder: callback.emailReminder,
            framework:
              opts.withFramework && endedAtStep
                ? {
                    furthestStep: endedAtStep,
                    endedAtStep,
                    closeAttempts,
                    objections: objections.map((tag) => ({
                      tag,
                      atStep: endedAtStep,
                      handled: false,
                    })),
                  }
                : null,
          },
          keyRef.current
        );

        if (res.ok) {
          onDone();
          return;
        }

        // Till skillnad från cockpiten väntar vi på svaret innan rutan stängs.
        // Där är kön hela poängen — säljaren är redan på nästa samtal och kan
        // ändå inte göra om det. Här är det ett samtal i taget, och en tyst
        // förlorad disposition på ett lovat samtal är precis den sortens tysta
        // bortfall som hela ombygget handlade om.
        setError(res.error);
        setSaving(false);
      } catch {
        setError("Kunde inte nå servern. Kontrollera uppkopplingen.");
        setSaving(false);
      }
    },
    [callback, closeAttempts, endedAtStep, notes, objections, onDone, row]
  );

  // ── Trappan ─────────────────────────────────────────────────────────────
  const pickResult = useCallback(
    (result: CallResult) => {
      const next = stageAfterResult(result);
      if (!next) {
        void commit({ result });
        return;
      }
      setFlow({ stage: next, result, outcome: null, noReason: null });
    },
    [commit]
  );

  const pickOutcome = useCallback(
    (outcome: ConversationOutcome) => {
      const result = flow.result;
      if (!result) return;

      if (outcome === "CALLBACK_BOOKED") {
        setFlow((f) => ({ ...f, outcome }));
        setAskCallback(true);
        return;
      }
      // Såld: affären registreras FÖRST, samtalet skrivs efteråt. Avbryter
      // säljaren rutan finns varken affär eller sålt samtal — samma ordning
      // som i cockpiten, och av samma skäl.
      if (outcome === "SOLD") {
        setFlow((f) => ({ ...f, outcome }));
        setShowDealModal(true);
        return;
      }
      if (stageAfterOutcome(outcome) === "reason") {
        setFlow((f) => ({ ...f, outcome, stage: "reason" }));
        return;
      }
      void commit({ result, outcome });
    },
    [commit, flow.result]
  );

  const pickReason = useCallback(
    (noReason: NoReason) => {
      const { result, outcome } = flow;
      if (!result) return;
      if (shouldAskFramework(result, outcome)) {
        setFlow((f) => ({ ...f, noReason, stage: "framework" }));
        setEndedAtStep("AVSLUT");
        return;
      }
      void commit({ result, outcome, noReason });
    },
    [commit, flow]
  );

  const goBack = useCallback(() => {
    setAskCallback(false);
    setFlow((f) => {
      if (f.stage === "reason") return { ...f, stage: "outcome", noReason: null };
      if (f.stage === "outcome" || f.stage === "gatekeeper") return INITIAL_FLOW;
      if (f.stage === "framework") return { ...f, stage: "reason" };
      return f;
    });
  }, []);

  // ── Tangenter ───────────────────────────────────────────────────────────
  //
  // Samma siffror som i cockpiten, så att muskelminnet följer med. Fält får
  // tangenterna själva — annars går det inte att skriva "1" i en anteckning.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if (e.key === "Escape" && !typing) {
        onClose();
        return;
      }
      if (typing || saving || showDealModal || askCallback) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        goBack();
        return;
      }
      if (flow.stage === "framework") return;

      const opt = optionForKey(flow.stage, e.key);
      if (!opt) return;
      e.preventDefault();
      // Tangenten som hör till "Inget telefonnummer" ska inte göra något här —
      // knappen är bortfiltrerad ovan, och utan den här grinden hade siffran
      // ändå nått pickResult och skrivit ett samtal med ett resultat som inte
      // finns i enumet.
      if (flow.stage === "result") {
        if (opt.value === NO_PHONE_FOUND) return;
        pickResult(opt.value as CallResult);
      }
      else if (flow.stage === "gatekeeper" || flow.stage === "outcome")
        pickOutcome(opt.value as ConversationOutcome);
      else if (flow.stage === "reason") pickReason(opt.value as NoReason);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [askCallback, flow.stage, goBack, onClose, pickOutcome, pickReason, pickResult, saving, showDealModal]);

  const overdue = row.scheduledAt.getTime() < Date.now();

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center px-4"
        style={{ background: "rgba(16, 24, 40, 0.45)" }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12 }}
          className="flex flex-col w-full max-w-[520px] max-h-[86vh] overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-3)",
          }}
        >
          {/* Vem, när och vad som skulle sägas */}
          <div
            className="flex items-start gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="text-[15px] font-semibold truncate"
                style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
              >
                {row.companyName}
              </p>
              <p className="text-[12px] mt-[2px]" style={{ color: "var(--text-muted)" }}>
                {row.contactName && <span>{row.contactName} · </span>}
                <span
                  className="mono-nums"
                  style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}
                >
                  <Clock size={10} className="inline mb-[1px] mr-[3px]" />
                  {formatWhen(row.scheduledAt, new Date())}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-sm shrink-0"
              style={{ color: "var(--text-dim)" }}
              title="Stäng utan att spara (Esc)"
            >
              <X size={15} />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {row.note && (
              <div
                className="rounded-md px-3 py-2 text-[12px] whitespace-pre-wrap"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {row.note}
              </div>
            )}

            {row.phone && (
              <a
                href={`tel:${row.phone}`}
                className="flex items-center justify-center gap-2 text-[13px] font-semibold py-[9px] rounded-md mono-nums"
                style={{
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <Phone size={13} /> {row.phone}
              </a>
            )}

            {/* Anteckningen skrivs före dispositionen: sista knapptrycket
                skickar, och ett fält efter den knappen hade aldrig fyllts i. */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anteckning från samtalet…"
              className="w-full text-[12px] px-3 py-2 rounded-md resize-y"
              style={{
                background: "var(--surface-inset)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />

            {error && (
              <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            {saving ? (
              <p className="text-[12px] py-2 text-center" style={{ color: "var(--text-dim)" }}>
                Sparar samtalet…
              </p>
            ) : askCallback ? (
              <CallbackForm
                draft={callback}
                onChange={setCallback}
                onSave={() =>
                  flow.result && void commit({ result: flow.result, outcome: "CALLBACK_BOOKED" })
                }
                onCancel={() => {
                  setAskCallback(false);
                  setCallback(EMPTY_CALLBACK);
                  setFlow((f) => ({ ...f, outcome: null }));
                }}
              />
            ) : flow.stage === "framework" ? (
              <FrameworkTap
                endedAtStep={endedAtStep}
                closeAttempts={closeAttempts}
                objections={objections}
                onStep={setEndedAtStep}
                onCloseAttempts={setCloseAttempts}
                onToggleObjection={(tag) =>
                  setObjections((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
                onSubmit={() =>
                  flow.result &&
                  void commit({
                    result: flow.result,
                    outcome: flow.outcome,
                    noReason: flow.noReason,
                    withFramework: true,
                  })
                }
                onSkip={() =>
                  flow.result &&
                  void commit({
                    result: flow.result,
                    outcome: flow.outcome,
                    noReason: flow.noReason,
                  })
                }
              />
            ) : (
              <>
                {flow.stage === "result" && (
                  <DispositionBar
                    stage="result"
                    /* "Inget telefonnummer" hör inte hemma här: raden ÄR ett
                       löfte om att ringa ett nummer någon redan haft i luren.
                       Knappen hade dessutom pensionerat bolaget mitt i en
                       återkomst, vilket är precis motsatsen till vad rutan är
                       till för. */
                    options={RESULT_OPTIONS.filter((o) => o.value !== NO_PHONE_FOUND)}
                    onPick={(v) => pickResult(v as CallResult)}
                    onBack={goBack}
                    canGoBack={false}
                  />
                )}
                {flow.stage === "gatekeeper" && (
                  <DispositionBar
                    stage="gatekeeper"
                    options={GATEKEEPER_OPTIONS}
                    onPick={pickOutcome}
                    onBack={goBack}
                    canGoBack
                  />
                )}
                {flow.stage === "outcome" && (
                  <DispositionBar
                    stage="outcome"
                    options={OUTCOME_OPTIONS}
                    onPick={pickOutcome}
                    onBack={goBack}
                    canGoBack
                  />
                )}
                {flow.stage === "reason" && (
                  <DispositionBar
                    stage="reason"
                    options={REASON_OPTIONS}
                    onPick={pickReason}
                    onBack={goBack}
                    canGoBack
                  />
                )}
              </>
            )}
          </div>

          <div
            className="px-5 py-2 shrink-0 text-[11px]"
            style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-dim)" }}
          >
            Samtalet skrivs först när dispositionen är klar. Stänger du rutan
            ligger återkomsten kvar.
          </div>
        </motion.div>
      </div>

      {showDealModal && (
        <RegisterDealModal
          leadId={row.leadId}
          companyName={row.companyName}
          defaultContactName={row.contactName}
          defaultContactEmail={row.contactEmail}
          defaultContactPhone={row.phone}
          onClose={() => {
            setShowDealModal(false);
            setFlow((f) => ({ ...f, outcome: null }));
          }}
          onCreated={() => {
            setShowDealModal(false);
            if (flow.result) void commit({ result: flow.result, outcome: "SOLD" });
          }}
        />
      )}
    </>
  );
}
