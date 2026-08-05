"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Globe, Linkedin, ChevronLeft, ChevronRight, ExternalLink, Mail,
  ArrowLeft, SkipForward, Clock, Building2, Zap, X, AlertTriangle, Copy,
  Check, TrendingUp, Loader2, CalendarClock,
} from "lucide-react";
import { startSession, endSession } from "@/app/actions/sessions";
import { leaseNextLeads, releaseLeases } from "@/app/actions/dialer";
import { heartbeat, goOffline } from "@/app/actions/presence";
import { CreateDealModal } from "@/components/deals/CreateDealModal";
import { DispositionBar } from "@/components/cockpit/DispositionBar";
import { GatekeeperPanel, EMPTY_GATEKEEPER, type GatekeeperDraft } from "@/components/cockpit/GatekeeperPanel";
import { FrameworkGuide, FrameworkTap } from "@/components/cockpit/FrameworkPanel";
import { ScriptPanel } from "@/components/cockpit/ScriptPanel";
import { useDispositionQueue } from "@/hooks/useDispositionQueue";
import { formatSwedish } from "@/lib/phone";
import {
  RESULT_OPTIONS, GATEKEEPER_OPTIONS, OUTCOME_OPTIONS, REASON_OPTIONS,
  INITIAL_FLOW, stageAfterResult, stageAfterOutcome, shouldAskFramework,
  type FlowState,
} from "@/lib/cockpit-flow";
import type {
  CallResult, ConversationOutcome, NoReason, FrameworkStep,
} from "@/generated/prisma/client";

type LeasedLead = Awaited<ReturnType<typeof leaseNextLeads>>[number];
type Stage = { id: string; name: string; color: string };
type Slot = { id: string; name: string; startMinute: number; endMinute: number };
type DrawerTab = "website" | "linkedin" | null;

// ─── Iframe med fallback ──────────────────────────────────────────────────────
function IframePanel({ src, label, fallbackHref }: { src: string; label: string; fallbackHref: string }) {
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  // Cross-origin går contentDocument aldrig att läsa — den gamla koden försökte
  // och fick alltid ett kast, vilket gjorde att fallbacken visades för varje
  // sajt. Enda signal vi faktiskt har är om load fyrar: en sida som blockeras
  // av X-Frame-Options eller CSP fyrar aldrig.
  useEffect(() => {
    loadedRef.current = false;
    setFailed(false);
    const t = setTimeout(() => { if (!loadedRef.current) setFailed(true); }, 4000);
    return () => clearTimeout(t);
  }, [src]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "var(--surface-inset)" }}>
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>Kan inte bädda in sidan</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>Webbplatsen blockerar inbäddning</p>
          <a href={fallbackHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-[10px]"
            style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <ExternalLink size={13} /> Öppna i ny flik
          </a>
        </div>
      </div>
    );
  }
  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      title={label}
      onLoad={() => { loadedRef.current = true; }}
      onError={() => setFailed(true)}
      // allow-same-origin borttaget: prospektets sajt behöver ingen tillgång
      // till sitt eget origin här, och kombinationen med allow-scripts är ren
      // attackyta. no-referrer hindrar att lead-id:t läcker till dem.
      sandbox="allow-scripts allow-forms allow-popups"
      referrerPolicy="no-referrer"
      allow=""
    />
  );
}

function EmailRow({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.preventDefault();
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-[12px]"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
        <Mail size={12} style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>E-post</p>
        <p className="text-[13px] truncate" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{email}</p>
      </div>
      <button onClick={copy} title="Kopiera e-post"
        className="w-7 h-7 flex items-center justify-center rounded-[7px] transition-all shrink-0"
        style={{ background: copied ? "var(--success-bg)" : "var(--surface)", border: `1px solid ${copied ? "var(--success-border)" : "var(--border-strong)"}` }}>
        {copied ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} style={{ color: "var(--text-muted)" }} />}
      </button>
    </div>
  );
}

function formatIdle(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Pitch-underlaget. Renderas bara för påståenden som faktiskt finns. */
function PitchPanel({ dossier }: { dossier: LeasedLead["dossier"] }) {
  if (!dossier || dossier.claims.length === 0) return null;

  // Två grindar, inte en.
  //
  // Konfidens: ett osäkert påstående på ett skarpt samtal är värre än inget
  // påstående alls — en säljare som har fel en gång slutar lita på verktyget.
  //
  // Säljstyrka: en körning mot riktiga leads visade att de vanligaste
  // bristerna också är de tråkigaste. Utan den här filtreringen läser
  // säljaren upp "ni saknar schema.org-markup" till en rörmokare.
  //
  // Högst tre punkter. Fler läser ingen medan telefonen ringer.
  const shown = dossier.claims
    .filter((c) => c.weakness && c.confidence >= 60 && c.strength >= 3)
    .slice(0, 3);
  if (shown.length === 0) return null;

  const age = dossier.fetchedAt
    ? Math.floor((Date.now() - new Date(dossier.fetchedAt).getTime()) / 86_400_000)
    : null;

  return (
    <div className="rounded-[14px] p-3.5 mb-3"
      style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--warning)" }}>
          Underlag
        </p>
        {age !== null && age > 14 && (
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            mätt {age} dagar sedan
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map((c) => (
          <div key={c.key} className="flex items-start gap-2">
            <span className="text-[13px] leading-tight shrink-0" style={{ color: "var(--warning)" }}>❗</span>
            <p className="text-[12.5px] leading-snug" style={{ color: "var(--text)" }}>
              {claimSentence(c)}
              {c.sourceUrl && (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-1.5 inline-flex" title="Öppna källan">
                  <ExternalLink size={10} style={{ color: "var(--text-dim)" }} />
                </a>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Formulering per uppgiftstyp. Säljaren ska aldrig läsa en rå nyckel. */
function claimSentence(c: LeasedLead["dossier"] extends { claims: (infer C)[] } | null ? C : never): string {
  const v = c.valueStr ?? (c.valueNum !== null ? String(c.valueNum) : c.valueBool === false ? "nej" : "ja");
  const sec = (ms: number) => (ms / 1000).toFixed(1).replace(".", ",");

  switch (c.key) {
    // ── Starkast ────────────────────────────────────────────────────────
    case "tech.hasWebsite":
      return "Bolaget har ingen hemsida alls";
    case "tech.siteReachable":
      // Formulerat som iakttagelse, inte som fastslaget faktum. Servern kan
      // ha varit nere just när vi mätte, och en säljare som påstår att en
      // fungerande sajt är död har förlorat samtalet.
      return v === "svarar inte"
        ? "Hemsidan svarade inte när vi kollade — verkar ligga nere"
        : `Hemsidan svarar med felkod (${v})`;
    case "tech.hasSSL":
      return "Sajten saknar HTTPS — Chrome visar besökarna “Inte säker”";
    case "tech.mobileFriendly":
      return "Sajten är inte byggd för mobil";
    case "tech.title":
      return v && v !== "ja"
        ? `Rubriken Google visar för dem är “${v}”`
        : "Sidan saknar rubrik helt — Google har inget att visa";

    // ── Stödjande ───────────────────────────────────────────────────────
    case "tech.hasMetaDescription":
      return "Ingen beskrivningstext under Google-träffen";
    case "tech.wordpressVersion":
      return `Sajten skyltar publikt med WordPress ${v} — en säkerhetsrisk`;
    case "tech.copyrightYear":
      return `Sidfoten säger fortfarande ${v}`;
    case "tech.hasAnalytics":
      return "Ingen besöksmätning — de vet inte hur många som hittar dem";
    case "tech.hasLocalBusinessSchema":
      return "Saknar företagsdata som Google läser för lokala sökningar";
    case "tech.ttfbMs":
      return `Servern svarar på ${sec(Number(c.valueNum))}s`;
    case "tech.pageBytes":
      return `Startsidan väger ${(Number(c.valueNum) / 1_000_000).toFixed(1)} MB`;

    // ── Hastighet ───────────────────────────────────────────────────────
    case "pagespeed.fieldLcp":
      return `Riktiga besökare väntar ${sec(Number(c.valueNum))}s innan sidan syns`;
    case "pagespeed.mobileLcp":
      return `Googles eget hastighetstest ger sidan ${sec(Number(c.valueNum))}s i mobilen`;
    case "pagespeed.mobileScore":
      return `Googles hastighetsbetyg är ${v} av 100`;

    // ── Google-profil och rank (kräver betald data) ─────────────────────
    case "gmb.reviewCount":
      return `${v} recensioner på Google`;
    case "gmb.newestReview":
      return `Senaste recensionen är från ${v}`;
    case "seo.rank":
      return `Plats ${v} på sökningen`;
    case "seo.keyword":
      return `Sökord: ${v}`;
    case "seo.competitor":
      return `${v} ligger före dem i sökresultatet`;

    default:
      return `${c.key}: ${v}`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CockpitDb({
  initialLeads,
  userId,
  stages,
  listId,
  listName,
  leaseMinutes,
  slots,
}: {
  initialLeads: LeasedLead[];
  userId: string;
  stages: Stage[];
  listId: string;
  listName: string;
  leaseMinutes: number;
  slots: Slot[];
}) {
  const router = useRouter();
  const queue = useDispositionQueue();

  const [leads, setLeads] = useState<LeasedLead[]>(initialLeads);
  const [index, setIndex] = useState(0);
  const [contactIndex, setContactIndex] = useState(0);
  const [refilling, setRefilling] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalCalls, setTotalCalls] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [totalIdleSeconds, setTotalIdleSeconds] = useState(0);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(null);
  const [notes, setNotes] = useState("");
  const [showDealModal, setShowDealModal] = useState(false);

  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW);
  const [gk, setGk] = useState<GatekeeperDraft>(EMPTY_GATEKEEPER);
  const [callbackAt, setCallbackAt] = useState<string>("");
  const [askCallback, setAskCallback] = useState(false);
  const [endedAtStep, setEndedAtStep] = useState<FrameworkStep | null>(null);
  const [closeAttempts, setCloseAttempts] = useState(0);
  const [objections, setObjections] = useState<string[]>([]);

  const lead = leads[index] ?? null;
  const contact = lead?.contacts[contactIndex] ?? null;
  const remaining = leads.length - index;

  // ── Refs för värden som cleanup och tangentbord behöver färska ──────────
  const sessionIdRef = useRef<string | null>(null);
  const totalCallsRef = useRef(0);
  const totalIdleRef = useRef(0);
  const leadsRef = useRef<LeasedLead[]>(initialLeads);
  const indexRef = useRef(0);
  sessionIdRef.current = sessionId;
  totalCallsRef.current = totalCalls;
  totalIdleRef.current = totalIdleSeconds;
  leadsRef.current = leads;
  indexRef.current = index;

  // ── Session ────────────────────────────────────────────────────────────
  // Den gamla koden hade cleanupen stängd över sessionId från FÖRSTA
  // renderingen, då det fortfarande var null — så endSession anropades aldrig
  // och varje CallSession i databasen saknade endedAt.
  useEffect(() => {
    let cancelled = false;
    startSession().then((s) => {
      if (cancelled) { void endSession(s.id, 0, 0); return; }
      setSessionId(s.id);
    });

    function flush() {
      const id = sessionIdRef.current;
      if (id) void endSession(id, totalCallsRef.current, totalIdleRef.current);
      void goOffline();
      // Leads vi inte hann med lämnas tillbaka direkt i stället för att ligga
      // låsta tills leasen går ut.
      const rest = leadsRef.current.slice(indexRef.current).map((l) => l.id);
      if (rest.length > 0) void releaseLeases(rest);
    }

    window.addEventListener("pagehide", flush);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Idle-timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setIdleSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Närvaro ────────────────────────────────────────────────────────────
  const pendingCallsRef = useRef(0);
  const pendingSoldRef = useRef(0);

  useEffect(() => {
    function beat() {
      const calls = pendingCallsRef.current;
      const sold = pendingSoldRef.current;
      pendingCallsRef.current = 0;
      pendingSoldRef.current = 0;
      const current = leadsRef.current[indexRef.current];
      void heartbeat({
        status: "DIALING",
        leadId: current?.id ?? null,
        companyName: current?.companyName ?? null,
        listId,
        listName,
        sessionId: sessionIdRef.current,
        callsDelta: calls,
        soldDelta: sold,
      });
    }
    beat();
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [listId, listName]);

  // ── Påfyllning ─────────────────────────────────────────────────────────
  const refill = useCallback(async () => {
    if (refilling || exhausted) return;
    setRefilling(true);
    try {
      const more = await leaseNextLeads(listId);
      if (more.length === 0) {
        setExhausted(true);
      } else {
        setLeads((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          return [...prev, ...more.filter((m) => !seen.has(m.id))];
        });
      }
    } finally {
      setRefilling(false);
    }
  }, [listId, refilling, exhausted]);

  useEffect(() => {
    if (remaining <= 5 && !exhausted) void refill();
  }, [remaining, exhausted, refill]);

  // Leasen går ut efter en stund — förnya innan den gör det, annars kan någon
  // annan ta leads som ligger kvar i kön här.
  useEffect(() => {
    const t = setInterval(() => { void refill(); }, Math.max(60_000, (leaseMinutes - 3) * 60_000));
    return () => clearInterval(t);
  }, [refill, leaseMinutes]);

  // ── Navigering ─────────────────────────────────────────────────────────
  const resetFlow = useCallback(() => {
    setFlow(INITIAL_FLOW);
    setGk(EMPTY_GATEKEEPER);
    setCallbackAt("");
    setAskCallback(false);
    setEndedAtStep(null);
    setCloseAttempts(0);
    setObjections([]);
    setNotes("");
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setContactIndex(0);
    setIdleSeconds(0);
    resetFlow();
  }, [resetFlow]);

  const prevLead = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
    setContactIndex(0);
    resetFlow();
  }, [resetFlow]);

  const skipLead = useCallback(() => {
    const target = leadsRef.current[indexRef.current];
    if (target) void releaseLeases([target.id]);
    advance();
  }, [advance]);

  // ── Skrivning ──────────────────────────────────────────────────────────
  const commit = useCallback(
    (opts: {
      result: CallResult;
      outcome?: ConversationOutcome | null;
      noReason?: NoReason | null;
      withGatekeeper?: boolean;
      withFramework?: boolean;
    }) => {
      const target = leadsRef.current[indexRef.current];
      if (!target) return;

      const idle = idleSeconds;
      setTotalCalls((n) => n + 1);
      setTotalIdleSeconds((n) => n + idle);
      pendingCallsRef.current += 1;
      if (opts.outcome === "SOLD") pendingSoldRef.current += 1;

      queue.enqueue({
        idempotencyKey: crypto.randomUUID(),
        leadId: target.id,
        companyName: target.companyName,
        contactId: target.contacts[contactIndex]?.id ?? null,
        listId,
        sessionId: sessionIdRef.current,
        result: opts.result,
        outcome: opts.outcome ?? null,
        noReason: opts.noReason ?? null,
        note: notes.trim() || null,
        idleBeforeSec: idle,
        dialedE164: target.contacts[contactIndex]?.directPhoneE164 ?? null,
        // Vilken manusversion som faktiskt låg på skärmen. Utan den går det
        // inte att jämföra två formuleringar mot bokningsfrekvens.
        scriptVersionId:
          target.scripts.find((s) => s.step === "INTRO" && !s.resolved.empty)?.versionId ??
          target.scripts.find((s) => !s.resolved.empty)?.versionId ??
          null,
        callbackAt: callbackAt ? new Date(callbackAt).toISOString() : null,
        gatekeeper: opts.withGatekeeper
          ? {
              name: gk.name.trim() || null,
              said: gk.said.trim() || null,
              dmName: gk.dmName.trim() || null,
              dmAvailability: gk.dmAvailability.trim() || null,
              passed: opts.outcome === "GATEKEEPER_TRANSFERRED",
            }
          : null,
        framework: opts.withFramework && endedAtStep
          ? {
              furthestStep: endedAtStep,
              endedAtStep,
              closeAttempts,
              objections: objections.map((tag) => ({ tag, atStep: endedAtStep, handled: false })),
            }
          : null,
      });

      // Navigeringen sker synkront — hela poängen med skriv-bakom-kön.
      advance();
    },
    [advance, callbackAt, closeAttempts, contactIndex, endedAtStep, gk, idleSeconds, listId, notes, objections, queue]
  );

  // ── Flödessteg ─────────────────────────────────────────────────────────
  const pickResult = useCallback((result: CallResult) => {
    const next = stageAfterResult(result);
    if (!next) { commit({ result }); return; }
    setFlow({ stage: next, result, outcome: null, noReason: null });
  }, [commit]);

  const pickOutcome = useCallback((outcome: ConversationOutcome) => {
    const result = flow.result;
    if (!result) return;

    if (outcome === "CALLBACK_BOOKED") {
      setFlow((f) => ({ ...f, outcome }));
      setAskCallback(true);
      return;
    }

    const next = stageAfterOutcome(outcome);
    if (next === "reason") {
      setFlow((f) => ({ ...f, outcome, stage: "reason" }));
      return;
    }
    commit({ result, outcome, withGatekeeper: flow.stage === "gatekeeper" });
  }, [commit, flow.result, flow.stage]);

  const pickReason = useCallback((noReason: NoReason) => {
    const { result, outcome } = flow;
    if (!result) return;
    if (shouldAskFramework(result, outcome)) {
      setFlow((f) => ({ ...f, noReason, stage: "framework" }));
      setEndedAtStep("AVSLUT");
      return;
    }
    commit({ result, outcome, noReason });
  }, [commit, flow]);

  const goBack = useCallback(() => {
    setAskCallback(false);
    setFlow((f) => {
      if (f.stage === "reason") return { ...f, stage: "outcome", noReason: null };
      if (f.stage === "outcome" || f.stage === "gatekeeper") return INITIAL_FLOW;
      if (f.stage === "framework") return { ...f, stage: "reason" };
      return f;
    });
  }, []);

  // ── Tangentbord ────────────────────────────────────────────────────────
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const handlersRef = useRef({ pickResult, pickOutcome, pickReason, goBack, advance, prevLead, skipLead, commit });
  handlersRef.current = { pickResult, pickOutcome, pickReason, goBack, advance, prevLead, skipLead, commit };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const h = handlersRef.current;
      const f = flowRef.current;

      if (e.key === "Backspace") { e.preventDefault(); h.goBack(); return; }
      if (e.key === "Escape") { setDrawerTab(null); return; }

      if (f.stage === "result") {
        const opt = RESULT_OPTIONS.find((o) => o.key === e.key);
        if (opt) { e.preventDefault(); h.pickResult(opt.value); return; }
        if (e.key === "ArrowRight") h.advance();
        if (e.key === "ArrowLeft") h.prevLead();
        if (e.key === "s") h.skipLead();
        return;
      }
      if (f.stage === "gatekeeper") {
        const opt = GATEKEEPER_OPTIONS.find((o) => o.key === e.key);
        if (opt) { e.preventDefault(); h.pickOutcome(opt.value); }
        return;
      }
      if (f.stage === "outcome") {
        const opt = OUTCOME_OPTIONS.find((o) => o.key === e.key);
        if (opt) { e.preventDefault(); h.pickOutcome(opt.value); }
        return;
      }
      if (f.stage === "reason") {
        const opt = REASON_OPTIONS.find((o) => o.key === e.key);
        if (opt) { e.preventDefault(); h.pickReason(opt.value); }
        return;
      }
      if (f.stage === "framework" && e.key === "Enter") {
        e.preventDefault();
        if (f.result) h.commit({ result: f.result, outcome: f.outcome, noReason: f.noReason, withFramework: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Härledda värden ────────────────────────────────────────────────────
  const websiteUrl = useMemo(() => {
    if (!lead?.website) return null;
    return lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
  }, [lead?.website]);

  const linkedinUrl = contact?.linkedin
    ? (contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`)
    : `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${contact?.name ?? ""} ${lead?.companyName ?? ""}`)}`;

  const currentSlotName = useMemo(() => {
    const m = new Date().getHours() * 60 + new Date().getMinutes();
    return slots.find((s) => m >= s.startMinute && m < s.endMinute)?.name ?? null;
  }, [slots]);

  // ── Tomt läge ──────────────────────────────────────────────────────────
  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          {refilling ? <Loader2 size={28} className="animate-spin" style={{ color: "var(--success)" }} /> : <Zap size={28} style={{ color: "var(--success)" }} />}
        </div>
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          {refilling ? "Hämtar fler..." : `${listName} är slut`}
        </h2>
        <p className="text-[14px] text-center max-w-[380px]" style={{ color: "var(--text-muted)" }}>
          {totalCalls} samtal denna session.
          {exhausted && " Inga fler leads är ringbara just nu — resten väntar på sin tur i uppföljningen."}
        </p>
        <button onClick={() => router.push(`/lists/${listId}`)} className="px-5 py-2 text-[13px] font-medium rounded-[10px] mt-2" style={{ background: "var(--accent)", color: "var(--bg)" }}>
          Tillbaka till listan
        </button>
      </div>
    );
  }

  const knownGk = lead.gatekeepers[0] ?? null;

  return (
    <div className="relative flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* Misslyckade skrivningar — diskret, avbryter aldrig */}
      <AnimatePresence>
        {queue.failed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-[62px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-[12px]"
            style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", boxShadow: "var(--shadow-md)" }}
          >
            <AlertTriangle size={14} style={{ color: "var(--danger)" }} />
            <span className="text-[12px] font-medium" style={{ color: "var(--danger)" }}>
              {queue.failed.length} samtal kunde inte sparas ({queue.failed[0].companyName})
            </span>
            <button onClick={queue.dismissFailed} style={{ color: "var(--danger)" }}><X size={12} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toppfält */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b shrink-0" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => router.push(`/lists/${listId}`)} className="flex items-center gap-1 text-[13px] shrink-0" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={14} /> Avsluta
          </button>
          <span className="text-[13px]" style={{ color: "var(--border-strong)" }}>/</span>
          <span className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{listName}</span>
          {currentSlotName && (
            <span className="text-[11px] px-2 py-[2px] rounded-full shrink-0" style={{ background: "var(--surface-inset)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
              {currentSlotName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <Phone size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{totalCalls}</span>
          </div>
          <div className="flex items-center gap-1 text-[12px]" style={{ color: idleSeconds > 120 ? "var(--warning)" : "var(--text-dim)" }}>
            <Clock size={11} /> <span style={{ fontFamily: "var(--font-mono)" }}>{formatIdle(idleSeconds)}</span>
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {remaining} kvar
          </span>
          {queue.pending > 0 && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }} title="Sparas i bakgrunden">
              <Loader2 size={10} className="animate-spin" /> {queue.pending}
            </span>
          )}
        </div>
      </div>

      {/* Innehåll */}
      <div className="flex-1 flex overflow-hidden">
        {/* Ramverket som passiv panel */}
        <div className="hidden lg:block w-[170px] shrink-0 border-r px-3 py-5 overflow-y-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <FrameworkGuide activeStep={flow.stage === "framework" ? endedAtStep : null} />
        </div>

        <div className="flex-1 flex items-start justify-center px-4 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={lead.id + contactIndex}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.09, ease: "easeOut" }}
              className="w-full max-w-[560px] py-5"
            >
              {/* Bolagsrubrik */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[15px] font-bold shrink-0"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", fontFamily: "var(--font-serif)" }}>
                  {lead.companyName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-[20px] leading-tight truncate" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
                    {lead.companyName}
                  </h1>
                  <div className="flex items-center gap-2 mt-[2px]">
                    {lead.attemptCount > 0 && (
                      <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                        Försök {lead.attemptCount + 1}
                      </span>
                    )}
                    {lead.callbackAt && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--accent)" }}>
                        <CalendarClock size={10} /> Lovad återuppringning
                      </span>
                    )}
                    {lead.contacts.length > 1 && (
                      <div className="flex items-center gap-1">
                        {lead.contacts.map((c, i) => (
                          <button key={c.id} onClick={() => setContactIndex(i)}
                            className="w-5 h-5 rounded-full text-[9px] font-bold transition-all"
                            style={{ background: i === contactIndex ? "var(--accent)" : "var(--surface-inset)", color: i === contactIndex ? "var(--bg)" : "var(--text-dim)", border: `1px solid ${i === contactIndex ? "var(--accent)" : "var(--border)"}` }}>
                            {c.name.charAt(0)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowDealModal(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-[9px] shrink-0"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
                  title="Skapa deal">
                  <TrendingUp size={11} /> Deal
                </button>
              </div>

              <PitchPanel dossier={lead.dossier} />
              <ScriptPanel scripts={lead.scripts} />

              {/* Kontaktkort */}
              {contact && (
                <div className="rounded-[18px] p-5 mb-3"
                  style={{ background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{contact.name}</p>
                      {contact.role && <p className="text-[13px] mt-[2px]" style={{ color: "var(--text-muted)" }}>{contact.role}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {websiteUrl && (
                        <button onClick={() => setDrawerTab("website")}
                          className="w-7 h-7 flex items-center justify-center rounded-[7px]"
                          style={{ background: drawerTab === "website" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "website" ? "var(--border-strong)" : "var(--border)"}` }}
                          title="Öppna hemsida">
                          <Globe size={12} style={{ color: drawerTab === "website" ? "var(--accent)" : "var(--text-muted)" }} />
                        </button>
                      )}
                      <button onClick={() => setDrawerTab("linkedin")}
                        className="w-7 h-7 flex items-center justify-center rounded-[7px]"
                        style={{ background: drawerTab === "linkedin" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "linkedin" ? "var(--border-strong)" : "var(--border)"}` }}
                        title="Öppna LinkedIn">
                        <Linkedin size={12} style={{ color: drawerTab === "linkedin" ? "var(--accent)" : "var(--text-muted)" }} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {contact.directPhoneE164 && (
                      <a href={`tel:${contact.directPhoneE164}`} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                        style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
                          <Phone size={13} color="var(--bg)" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Direkttelefon</p>
                          <p className="text-[16px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                            {formatSwedish(contact.directPhoneE164)}
                          </p>
                        </div>
                        <ExternalLink size={13} className="ml-auto" style={{ color: "var(--text-dim)" }} />
                      </a>
                    )}
                    {contact.switchboardE164 && (
                      <a href={`tel:${contact.switchboardE164}`} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                          <Building2 size={12} style={{ color: "var(--text-muted)" }} />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Växel</p>
                          <p className="text-[15px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                            {formatSwedish(contact.switchboardE164)}
                          </p>
                        </div>
                      </a>
                    )}
                    {contact.email && <EmailRow email={contact.email} />}
                  </div>
                </div>
              )}

              {/* Anteckning */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anteckning — sparas med samtalet"
                rows={2}
                className="w-full resize-none text-[13px] px-4 py-3 rounded-[12px] outline-none mb-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)", lineHeight: 1.5 }}
              />

              {/* Växelpanel */}
              {flow.stage === "gatekeeper" && (
                <GatekeeperPanel
                  known={knownGk}
                  draft={gk}
                  onChange={setGk}
                  onSubmit={() => pickOutcome("GATEKEEPER_BLOCKED")}
                />
              )}

              {/* Återuppringningsdatum */}
              {askCallback && (
                <div className="rounded-[14px] p-4 mb-3" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
                    När ska du ringa?
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={callbackAt}
                      onChange={(e) => setCallbackAt(e.target.value)}
                      autoFocus
                      className="flex-1 px-3 py-2 text-[13px] rounded-[9px] outline-none"
                      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                    />
                    <button
                      onClick={() => flow.result && commit({ result: flow.result, outcome: "CALLBACK_BOOKED", withGatekeeper: false })}
                      disabled={!callbackAt}
                      className="px-4 py-2 text-[12px] font-semibold rounded-[9px]"
                      style={{ background: callbackAt ? "var(--accent)" : "var(--surface)", color: callbackAt ? "var(--bg)" : "var(--text-dim)", border: "1px solid var(--border)" }}
                    >
                      Spara
                    </button>
                  </div>
                </div>
              )}

              {/* Ramverksfrågan */}
              {flow.stage === "framework" && (
                <FrameworkTap
                  endedAtStep={endedAtStep}
                  closeAttempts={closeAttempts}
                  objections={objections}
                  onStep={setEndedAtStep}
                  onCloseAttempts={setCloseAttempts}
                  onToggleObjection={(tag) =>
                    setObjections((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
                  }
                  onSubmit={() => flow.result && commit({ result: flow.result, outcome: flow.outcome, noReason: flow.noReason, withFramework: true })}
                  onSkip={() => flow.result && commit({ result: flow.result, outcome: flow.outcome, noReason: flow.noReason })}
                />
              )}

              {/* Dispositionstrappan */}
              {!askCallback && flow.stage !== "framework" && (
                <>
                  {flow.stage === "result" && (
                    <DispositionBar stage="result" options={RESULT_OPTIONS} onPick={pickResult} onBack={goBack} canGoBack={false} />
                  )}
                  {flow.stage === "gatekeeper" && (
                    <DispositionBar stage="gatekeeper" options={GATEKEEPER_OPTIONS} onPick={pickOutcome} onBack={goBack} canGoBack />
                  )}
                  {flow.stage === "outcome" && (
                    <DispositionBar stage="outcome" options={OUTCOME_OPTIONS} onPick={pickOutcome} onBack={goBack} canGoBack />
                  )}
                  {flow.stage === "reason" && (
                    <DispositionBar stage="reason" options={REASON_OPTIONS} onPick={pickReason} onBack={goBack} canGoBack />
                  )}
                </>
              )}

              {/* Navigering */}
              {flow.stage === "result" && (
                <div className="flex items-center justify-between gap-2 mt-3">
                  <button onClick={prevLead} disabled={index === 0}
                    className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index === 0 ? 0.4 : 1 }}>
                    <ChevronLeft size={13} /> Föregående
                  </button>
                  <button onClick={skipLead}
                    className="flex items-center gap-1 text-[11px] px-3 py-2 rounded-[8px]"
                    style={{ color: "var(--text-dim)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <SkipForward size={12} /> Skippa (S)
                  </button>
                  <button onClick={advance}
                    className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-[8px]"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    Nästa <ChevronRight size={13} />
                  </button>
                </div>
              )}

              <p className="text-center text-[10px] mt-3" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                siffror = välj · backsteg = ångra · S skippa · ESC stäng panel
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Höger panel */}
      <AnimatePresence>
        {drawerTab !== null && (
          <>
            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }} className="fixed inset-0 z-30 cursor-pointer"
              style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(2px)", top: "52px" }}
              onClick={() => setDrawerTab(null)} />
            <motion.div key="drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="fixed right-0 bottom-0 z-40 flex flex-col"
              style={{ top: "52px", width: "62%", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-xl)" }}>
              <div className="flex items-center justify-between px-4 h-[44px] border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-[2px] p-[2px] rounded-[8px]" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                  {websiteUrl && (
                    <button onClick={() => setDrawerTab("website")}
                      className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-[6px]"
                      style={{ background: drawerTab === "website" ? "var(--surface)" : "transparent", color: drawerTab === "website" ? "var(--text)" : "var(--text-dim)" }}>
                      <Globe size={11} /> Hemsida
                    </button>
                  )}
                  <button onClick={() => setDrawerTab("linkedin")}
                    className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-[6px]"
                    style={{ background: drawerTab === "linkedin" ? "var(--surface)" : "transparent", color: drawerTab === "linkedin" ? "var(--text)" : "var(--text-dim)" }}>
                    <Linkedin size={11} /> LinkedIn
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <a href={drawerTab === "website" ? websiteUrl ?? "#" : linkedinUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px]"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <ExternalLink size={11} /> Öppna
                  </a>
                  <button onClick={() => setDrawerTab(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-[7px]"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <X size={13} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {drawerTab === "website" && websiteUrl && (
                  <IframePanel key={`w-${lead.id}`} src={websiteUrl} label="Hemsida" fallbackHref={websiteUrl} />
                )}
                {drawerTab === "linkedin" && (
                  <IframePanel key={`l-${contact?.id}`} src={linkedinUrl} label="LinkedIn" fallbackHref={linkedinUrl} />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showDealModal && (
        <CreateDealModal
          leadId={lead.id}
          companyName={lead.companyName}
          stages={stages}
          defaultStageId={stages.find((s) => s.name.toLowerCase().includes("möte"))?.id ?? stages[0]?.id ?? ""}
          onClose={() => setShowDealModal(false)}
          onCreated={() => { setShowDealModal(false); advance(); }}
        />
      )}
    </div>
  );
}
