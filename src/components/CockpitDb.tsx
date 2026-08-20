"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Globe, Linkedin, ChevronLeft, ChevronRight, ExternalLink, Mail,
  ArrowLeft, SkipForward, Clock, Building2, Zap, X, AlertTriangle, Copy,
  Check, Loader2, CalendarClock, MapPin, Users, Banknote,
  Search, Star, Trophy, Tag,
} from "lucide-react";
import { startSession, endSession } from "@/app/actions/sessions";
import { leaseNextLeads, releaseLeases, renewLeases, leaseSpecificLead, type OpenWarning } from "@/app/actions/dialer";
import type { LeadSearchHit } from "@/app/actions/leads";
import { heartbeat, goOffline } from "@/app/actions/presence";
import { saveCockpitNote } from "@/app/actions/activities";
import { RegisterDealModal } from "@/components/deals/RegisterDealModal";
import { DispositionBar } from "@/components/cockpit/DispositionBar";
import { GatekeeperPanel, EMPTY_GATEKEEPER, type GatekeeperDraft } from "@/components/cockpit/GatekeeperPanel";
import { FrameworkRail, FrameworkTap } from "@/components/cockpit/FrameworkPanel";
import { ScriptPanel } from "@/components/cockpit/ScriptPanel";
import { CallbackForm, EMPTY_CALLBACK, type CallbackDraft } from "@/components/cockpit/CallbackForm";
import { LeadHistory, type HistoryActivity } from "@/components/cockpit/LeadHistory";
import { LeadSwitcher } from "@/components/cockpit/LeadSwitcher";
import { CallbackBell } from "@/components/cockpit/CallbackBell";
import { useDispositionQueue } from "@/hooks/useDispositionQueue";
import { formatSwedish } from "@/lib/phone";
import { formatWhen } from "@/lib/time";
import {
  RESULT_OPTIONS, GATEKEEPER_OPTIONS, OUTCOME_OPTIONS, REASON_OPTIONS,
  INITIAL_FLOW, stageAfterResult, stageAfterOutcome, shouldAskFramework,
  type FlowState,
} from "@/lib/cockpit-flow";
import type {
  CallResult, ConversationOutcome, NoReason, FrameworkStep,
} from "@/generated/prisma/client";

type LeasedLead = Awaited<ReturnType<typeof leaseNextLeads>>[number];
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
        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--text)" }}>Kan inte bädda in sidan</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>Webbplatsen blockerar inbäddning</p>
          <a href={fallbackHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-md"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
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
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
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
        className="w-7 h-7 flex items-center justify-center rounded-sm transition-all shrink-0"
        style={{ background: copied ? "var(--success-bg)" : "var(--surface)", border: `1px solid ${copied ? "var(--success-border)" : "var(--border-strong)"}` }}>
        {copied ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} style={{ color: "var(--text-muted)" }} />}
      </button>
    </div>
  );
}

function formatIdle(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Sekunder innan dödtiden räknas som full. Efter tre minuter mellan två
 *  samtal har säljaren slutat ringa och börjat göra något annat. */
const IDLE_CEILING = 180;

/** Manusspaltens bredd. Ramverksradens högerzon måste vara exakt lika bred,
 *  annars hamnar kedjan inte över dashen. Ett värde, två användningar. */
const MANUS_COL = "w-[42%] max-w-[560px]";

/** Dashens läsbredd. Delas av ramverksraden, dashen och trappan så de tre
 *  ligger på samma axel. */
const DASH_W = "max-w-[860px]";

/**
 * Takten. Enda siffran i hela systemet som faktiskt driver samtalsvolym:
 * tiden sedan förra dispositionen, och hur många samtal den takten ger
 * per timme. Mätaren är avsiktligt placerad där blicken redan är — i
 * headern, bredvid antalet samtal — och färgen eskalerar tyst.
 *
 * Samtal per timme visas först efter fem minuter. Dessförinnan är
 * nämnaren så liten att talet studsar mellan 0 och 300 och bara blir brus.
 */
function PaceMeter({
  totalCalls,
  idleSeconds,
  elapsedSeconds,
}: {
  totalCalls: number;
  idleSeconds: number;
  elapsedSeconds: number;
}) {
  const color =
    idleSeconds >= IDLE_CEILING ? "var(--danger)"
    : idleSeconds >= 90 ? "var(--warning)"
    : idleSeconds >= 45 ? "var(--text-muted)"
    : "var(--text-dim)";

  const fill = Math.min(1, idleSeconds / IDLE_CEILING);
  const perHour = elapsedSeconds >= 300 ? Math.round((totalCalls / elapsedSeconds) * 3600) : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Phone size={11} />
        <span className="mono-nums">{totalCalls}</span>
      </div>

      {perHour !== null && (
        <div
          className="flex items-center gap-1 text-[12px]"
          style={{ color: "var(--text-muted)" }}
          title="Samtal per timme i den här sessionen"
        >
          <span className="mono-nums">{perHour}</span>
          <span style={{ color: "var(--text-dim)" }}>/h</span>
        </div>
      )}

      {/* Dödtid. Stapeln fylls mot tre minuter — en rörelse i ögonvrån
          säger mer än siffran och kostar ingen uppmärksamhet. */}
      <div
        className="flex items-center gap-1.5"
        title="Tid sedan senaste disposition"
      >
        <Clock size={11} style={{ color }} />
        <span className="text-[12px] mono-nums tabular-nums" style={{ color, minWidth: 34 }}>
          {formatIdle(idleSeconds)}
        </span>
        <span
          className="hidden sm:block h-[3px] w-10 rounded-full overflow-hidden"
          style={{ background: "var(--surface-inset)" }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${fill * 100}%`,
              background: color,
              transition: "width 1s linear, background-color 0.4s ease",
            }}
          />
        </span>
      </div>
    </div>
  );
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
    <div className="rounded-lg p-3.5 mb-3"
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

/**
 * SEO-rutan — hela synlighetsbilden, inte bara det säljbara.
 *
 * Skiljer sig från PitchPanel med flit. Den rutan är en pitchmotor: tre
 * svagheter, filtrerade på säljstyrka, formulerade som repliker. Den här är ett
 * uppslagsverk säljaren tittar i när prospektet ifrågasätter något — och då
 * måste även de bra siffrorna finnas där. Ett bolag som ligger tvåa och har
 * 4,9 i betyg ska synas som just det; att dölja det för att det inte går att
 * sälja på gör verktyget till en partsinlaga, och säljaren märker det.
 *
 * Rutan renderas bara när det finns något att visa. Tomt är ett giltigt
 * tillstånd — de flesta leads saknar bransch eller ort och får därför aldrig
 * något sökord att mätas på.
 */
function SeoPanel({ dossier }: { dossier: LeasedLead["dossier"] }) {
  if (!dossier) return null;

  const claims = dossier.claims;
  const find = (key: string) => claims.find((c) => c.key === key);

  const rank = find("seo.rank");
  const keyword = find("seo.keyword");
  const competitor = find("seo.competitor");
  const rating = find("gmb.rating");
  const reviews = find("gmb.reviewCount");
  const category = find("gmb.category");
  const services = find("seo.services");
  const rivals = find("seo.rivals");
  const localLeader = find("gmb.localLeader");

  const anything =
    rank || keyword || competitor || rating || reviews || category || services;
  if (!anything) return null;

  // Källan står utskriven. En siffra ur en importfil och en vi hämtat själva
  // är olika mycket värda i ett samtal, och säljaren ska kunna se vilket det
  // är utan att fråga.
  const source = rank?.source ?? keyword?.source ?? "okänd";
  const stamp = rank?.fetchedAt ?? keyword?.fetchedAt ?? null;
  const age = stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 86_400_000) : null;

  // Google visar tio träffar per sida. Plats 14 är sida 2 — och "sida 2" är
  // det prospektet begriper, inte talet 14.
  const position = rank?.valueNum ?? null;
  const page = position != null ? Math.ceil(position / 10) : null;

  return (
    <div className="rounded-lg p-3.5 mb-3"
      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Search size={11} style={{ color: "var(--text-dim)" }} />
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
            Synlighet på Google
          </p>
        </div>
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
          {source === "import" ? "ur importfil" : source}
          {age !== null && age > 0 && ` · ${age} d`}
        </span>
      </div>

      {/* Placeringen. Det enda talet säljaren behöver ha i huvudet. */}
      {rank && (
        <div className="flex items-baseline gap-2 mb-2">
          {position != null ? (
            <>
              <span className="text-[26px] font-semibold leading-none"
                style={{ color: position <= 5 ? "var(--success)" : "var(--warning)", fontFamily: "var(--font-mono)" }}>
                {position}
              </span>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                :a plats{page && page > 1 ? ` — sida ${page}` : " — sida 1"}
              </span>
            </>
          ) : (
            <span className="text-[14px] font-medium" style={{ color: "var(--warning)" }}>
              {rank.valueStr}
            </span>
          )}
        </div>
      )}

      {keyword?.valueStr && (
        <p className="text-[12px] mb-2.5" style={{ color: "var(--text-muted)" }}>
          på sökningen <span style={{ color: "var(--text)" }}>”{keyword.valueStr}”</span>
          {rivals?.valueNum != null && (
            <span style={{ color: "var(--text-dim)" }}> · {rivals.valueNum} konkurrenter</span>
          )}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {competitor?.valueStr && (
          <SeoRow icon={<Trophy size={11} style={{ color: "var(--text-dim)" }} />} label="Ligger etta">
            {competitor.valueStr}
          </SeoRow>
        )}

        {/* Betyg och recensioner hör ihop och läses som en enhet. Ett betyg
            utan antal säger ingenting — 5,0 av en recension är inte 5,0. */}
        {(rating?.valueNum != null || reviews?.valueNum != null) && (
          <SeoRow icon={<Star size={11} style={{ color: "var(--text-dim)" }} />} label="Google-profil">
            {rating?.valueNum != null && (
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {rating.valueNum.toLocaleString("sv-SE", { minimumFractionDigits: 1 })}
              </span>
            )}
            {rating?.valueNum != null && reviews?.valueNum != null && " · "}
            {reviews?.valueNum != null && (
              <span style={{ color: reviews.valueNum < 5 ? "var(--warning)" : undefined }}>
                {reviews.valueNum === 0 ? "inga recensioner" : `${reviews.valueNum} recensioner`}
              </span>
            )}
          </SeoRow>
        )}

        {localLeader?.valueStr && (
          <SeoRow icon={<MapPin size={11} style={{ color: "var(--text-dim)" }} />} label="Kartrutan">
            {localLeader.valueStr}
          </SeoRow>
        )}

        {category?.valueStr && (
          <SeoRow icon={<Tag size={11} style={{ color: "var(--text-dim)" }} />} label="Kategori">
            {category.valueStr}
          </SeoRow>
        )}

        {services?.valueStr && (
          <SeoRow icon={<Zap size={11} style={{ color: "var(--text-dim)" }} />} label="Tjänster">
            {services.valueStr}
          </SeoRow>
        )}
      </div>

      {rank?.sourceUrl && (
        <a href={rank.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2.5 text-[11px]"
          style={{ color: "var(--text-dim)" }}>
          Se sökningen <ExternalLink size={9} />
        </a>
      )}
    </div>
  );
}

function SeoRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[3px] shrink-0">{icon}</span>
      <p className="text-[12px] leading-snug min-w-0" style={{ color: "var(--text)" }}>
        <span style={{ color: "var(--text-dim)" }}>{label}: </span>
        {children}
      </p>
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

    // ── Google-profil och rank (Serper) ─────────────────────────────────
    case "gmb.reviewCount":
      return Number(c.valueNum) === 0
        ? "Inga recensioner alls på Google"
        : `Bara ${v} recensioner på Google`;
    case "gmb.rating":
      return `Betyget på Google är ${v} av 5`;
    case "gmb.newestReview":
      return `Senaste recensionen är från ${v}`;
    case "gmb.localRank":
      return `Plats ${v} i kartrutan — utanför de tre som visas`;
    case "seo.rank":
      // Talet finns bara när de faktiskt hittades. Saknas det bär valueStr
      // förbehållet ("utanför topp 100") och det ska läsas ordagrant — att
      // säga "plats utanför topp 100" är inte svenska, och värre: det låter
      // som en placering.
      return c.valueNum != null
        ? `Ligger på plats ${c.valueNum} — sida ${Math.ceil(Number(c.valueNum) / 10)}`
        : `Syns inte på sitt eget sökord (${v})`;
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
  listId,
  listName,
  leaseMinutes,
  slots,
  openedLeadId = null,
  openedWarnings = [],
}: {
  initialLeads: LeasedLead[];
  userId: string;
  /** Null när bolaget slogs upp via sökningen och inte ligger i någon mapp
   *  säljaren kommer åt. Påfyllningen tar då ur hela det egna däcket. */
  listId: string | null;
  listName: string | null;
  leaseMinutes: number;
  slots: Slot[];
  /** Bolaget som slogs upp via sökningen, om vägen in var "Öppna i dialer". */
  openedLeadId?: string | null;
  openedWarnings?: OpenWarning[];
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(null);
  const [notes, setNotes] = useState("");
  const [showDealModal, setShowDealModal] = useState(false);
  // Anteckningar som redan sparats med Enter under det här samtalet. De ligger
  // på servern, men historiken kommer från leasen och hämtas inte om mitt i ett
  // samtal — så säljaren skulle inte se sin egen anteckning förrän hen kom
  // tillbaka till bolaget. Den här listan renderas ovanpå den hämtade
  // historiken tills nästa lease.
  const [savedNotes, setSavedNotes] = useState<HistoryActivity[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState(false);

  // Bolaget som slogs upp på namn — vid ingången eller senare med ⌘K. Bärs som
  // state och inte bara som prop: varningarna hör till det uppslagna bolaget,
  // och byter man bolag mitt i passet är det de nya som gäller.
  const [opened, setOpened] = useState<{ id: string; warnings: OpenWarning[] } | null>(
    openedLeadId ? { id: openedLeadId, warnings: openedWarnings } : null
  );
  const [showSwitcher, setShowSwitcher] = useState(false);

  // Satt när förnyelsen upptäcker att bolaget på skärmen bytt ägare medan
  // fliken låg och sov. Bolaget står kvar — men säljaren ska veta det innan
  // hen slår numret. Se `syncLeases`.
  const [takenOver, setTakenOver] = useState<{ leadId: string; holder: string | null } | null>(null);

  /** Återkomsten som ledde hit, per bolag. Läses av `commit` och töms där —
   *  en rad som ligger kvar hade stängt fel löfte nästa gång bolaget ringdes. */
  const answeredCallbackRef = useRef<Record<string, string>>({});

  /** Senast dispositionerade bolaget. Notisklockan lyssnar: utan den låg
   *  bandet kvar tills nästa hämtning, alltså upp till en minut efter att
   *  samtalet var klart. Tidsstämpeln finns för att två samtal på samma bolag
   *  ska räknas som två händelser och inte som samma. */
  const [calledLead, setCalledLead] = useState<{ leadId: string; at: number } | null>(null);

  const [flow, setFlow] = useState<FlowState>(INITIAL_FLOW);
  const [gk, setGk] = useState<GatekeeperDraft>(EMPTY_GATEKEEPER);
  const [callback, setCallback] = useState<CallbackDraft>(EMPTY_CALLBACK);
  const [askCallback, setAskCallback] = useState(false);
  const [endedAtStep, setEndedAtStep] = useState<FrameworkStep | null>(null);
  const [closeAttempts, setCloseAttempts] = useState(0);
  const [objections, setObjections] = useState<string[]>([]);

  const lead = leads[index] ?? null;
  const contact = lead?.contacts[contactIndex] ?? null;
  const remaining = leads.length - index;

  // ── Refs för värden som cleanup och tangentbord behöver färska ──────────
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef(Date.now());
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
  // Samma tick driver både dödtiden och sessionslängden, så samtal/timme
  // aldrig kan glida isär från klockan bredvid.
  useEffect(() => {
    const t = setInterval(() => {
      setIdleSeconds((s) => s + 1);
      setElapsedSeconds(Math.round((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
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

  // ── Förnyelse av parkeringen ───────────────────────────────────────────
  //
  // Kön räcker längre än leasen: 25 bolag är över en timmes samtal på en
  // parkering som dör efter en kvart. Utan förnyelse ligger svansen olåst i
  // databasen medan den fortfarande står på säljarens skärm, och rotationen
  // serverar den till nästa säljare som startar ett pass. Det hände 2026-08-17
  // — två säljare på samma bolag.
  //
  // Här stod tidigare `refill()` under rubriken "förnya innan leasen går ut".
  // Den leasar bara NYA bolag och rör aldrig dem som redan ligger i kön, så
  // förnyelsen har i praktiken aldrig funnits.
  //
  // Förnyas gör bara det oringda: `slice(index)`. Bolag bakom index är redan
  // dispositionerade, och `recordAttempt` släpper låset i samma skrivning som
  // samtalet — att förlänga dem hade parkerat bolag ingen ska ringa.
  const syncLeases = useCallback(async () => {
    const pending = leadsRef.current.slice(indexRef.current).map((l) => l.id);
    if (pending.length === 0) return;

    const { lost } = await renewLeases(pending);
    if (lost.length === 0) return;

    // Ett förlorat bolag ska bort ur kön direkt. Alternativet är att säljaren
    // ringer ett företag som kollegan sitter i just nu — felet vi lagar.
    const lostIds = new Set(lost.map((l) => l.id));
    const current = leadsRef.current[indexRef.current];

    setLeads((prev) =>
      // Det AKTUELLA bolaget yanks aldrig, hur låset än ser ut: säljaren kan ha
      // kunden på tråden i sekunden det här svaret landar, och att byta skärm
      // mitt i ett samtal är värre än dubbelringningen som redan pågår. Det
      // markeras i stället med ett band över bolagsrubriken, och dispositionen
      // får skrivas klart som vanligt.
      prev.filter((l, i) => i <= indexRef.current || !lostIds.has(l.id))
    );

    if (current && lostIds.has(current.id)) {
      const holder = lost.find((l) => l.id === current.id)?.holder;
      setTakenOver({ leadId: current.id, holder: holder ?? null });
    }
  }, []);

  useEffect(() => {
    // En tredjedel av leasen ger två missade förnyelser innan ett bolag släpps
    // — ett tappat nätverksanrop ska inte kosta kön.
    const every = Math.max(60_000, (leaseMinutes / 3) * 60_000);
    const t = setInterval(() => { void syncLeases(); }, every);
    return () => clearInterval(t);
  }, [syncLeases, leaseMinutes]);

  // En dator som somnar kör inga intervall. Vaknar fliken kan leasen ha gått ut
  // och bolag hunnit byta ägare, så synken körs direkt i stället för att vänta
  // ut nästa tick — annars är första samtalet efter lunch det som krockar.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void syncLeases();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncLeases]);

  // ── Navigering ─────────────────────────────────────────────────────────
  const resetFlow = useCallback(() => {
    setFlow(INITIAL_FLOW);
    setGk(EMPTY_GATEKEEPER);
    setCallback(EMPTY_CALLBACK);
    setAskCallback(false);
    setEndedAtStep(null);
    setCloseAttempts(0);
    setObjections([]);
    setNotes("");
    setShowDealModal(false);
    // Sparade anteckningar följer med leadet, inte säljaren. Nästa bolag har
    // sin egen historik.
    setSavedNotes([]);
    setNoteError(false);
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

  /**
   * Byt till ett uppslaget bolag utan att lämna passet.
   *
   * Bolaget läggs direkt efter det aktuella och blir nästa i kön — inte i
   * stället för kön. Det pågående samtalet hoppas över precis som med `s`:
   * ingen disposition skrivs, bolaget ligger kvar och kommer tillbaka.
   *
   * Att i stället navigera om till /cockpit?leadId=… hade avslutat
   * ringsessionen och startat en ny, vilket delar säljarens pass i två i
   * statistiken varje gång någon slår upp ett bolag.
   */
  const openLeadById = useCallback(async (leadId: string): Promise<string | null> => {
    const res = await leaseSpecificLead(leadId);
    if (!res.ok) return res.message;

    const cur = indexRef.current;
    const hasCurrent = Boolean(leadsRef.current[cur]);
    const at = hasCurrent ? cur + 1 : cur;

    setLeads((prev) => {
      // En dubblett längre fram i kön plockas bort — annars serveras bolaget
      // en gång till om ett par samtal, nu utan att någon bett om det.
      const kept = prev.filter((l, i) => i < at || l.id !== res.lead.id);
      return [...kept.slice(0, at), res.lead, ...kept.slice(at)];
    });
    setOpened({ id: res.lead.id, warnings: res.warnings });

    if (hasCurrent) {
      advance();
    } else {
      setContactIndex(0);
      setIdleSeconds(0);
      resetFlow();
    }
    return null;
  }, [advance, resetFlow]);

  const openSearched = useCallback(
    (hit: LeadSearchHit) => openLeadById(hit.id),
    [openLeadById]
  );

  /**
   * Ta bolaget bakom en återkomst utan att lämna passet.
   *
   * Samma väg som ⌘K-sökningen: bolaget reserveras och läggs först i kön.
   * Skillnaden är att raden pekas ut. `recordAttempt` stänger annars bara
   * återkomster vars tid redan passerat, och klockan larmar fem minuter för
   * tidigt — utan `answeredCallbackId` hade ett samtal ringt 13:57 på ett
   * löfte klockan 14:00 lämnat löftet öppet i klockan efteråt.
   */
  const openCallback = useCallback(
    async (leadId: string, callbackId: string): Promise<string | null> => {
      const message = await openLeadById(leadId);
      if (!message) answeredCallbackRef.current[leadId] = callbackId;
      return message;
    },
    [openLeadById]
  );

  // ── Anteckning: Enter sparar ───────────────────────────────────────────
  //
  // Anteckningen låg tidigare bara i klientens minne tills säljaren
  // dispositionerade samtalet. Skrev hen något och gick vidare utan att sätta
  // ett utfall var texten borta, och hon fick aldrig se den — historiken
  // hämtas med leasen, så den egna anteckningen dök upp först om hon råkade
  // komma tillbaka till bolaget.
  //
  // Enter skriver den nu direkt. Shift+Enter ger radbrytning: anteckningar är
  // ofta flerradiga, och att offra Enter helt hade tvingat fram en enda
  // löpande mening.
  const commitNote = useCallback(async () => {
    const text = notes.trim();
    const target = leadsRef.current[indexRef.current];
    if (!text || !target || savingNote) return;

    setSavingNote(true);
    setNoteError(false);
    // Fältet töms direkt — kvitton ska komma före nätverket, annars hinner
    // säljaren skriva vidare i en textarea som håller på att skickas.
    setNotes("");

    try {
      const saved = await saveCockpitNote({
        leadId: target.id,
        contactId: target.contacts[contactIndex]?.id ?? null,
        sessionId: sessionIdRef.current,
        note: text,
      });
      setSavedNotes((prev) => [saved, ...prev]);
    } catch {
      // Lägg tillbaka texten. En tappad anteckning som säljaren tror är sparad
      // är värre än en som uppenbart inte gick igenom.
      setNotes(text);
      setNoteError(true);
    } finally {
      setSavingNote(false);
    }
  }, [notes, contactIndex, savingNote]);

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
        // datetime-local ger lokal tid utan zon; new Date() tolkar den i
        // webbläsarens zon, vilket är säljarens. Det är rätt tolkning — hen
        // skrev klockslaget hen sa i luren.
        callbackAt: callback.at ? new Date(callback.at).toISOString() : null,
        callbackNote: callback.note.trim() || null,
        callbackEmailReminder: callback.emailReminder,
        // Kom säljaren hit via klockan svarar samtalet på just den raden, även
        // om den utsatta tiden inte hunnit passera.
        answeredCallbackId: answeredCallbackRef.current[target.id] ?? null,
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

      delete answeredCallbackRef.current[target.id];
      setCalledLead({ leadId: target.id, at: Date.now() });

      // Navigeringen sker synkront — hela poängen med skriv-bakom-kön.
      advance();
    },
    [advance, callback, closeAttempts, contactIndex, endedAtStep, gk, idleSeconds, listId, notes, objections, queue]
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

    // Såld: rutan öppnas direkt, och samtalet skrivs FÖRST när affären är
    // registrerad. Att skriva dispositionen här och registrera affären sedan
    // hade gjort "Avbryt" till en tyst datafalsk — ett sålt samtal i
    // statistiken utan någon kund bakom.
    if (outcome === "SOLD") {
      setFlow((f) => ({ ...f, outcome }));
      setShowDealModal(true);
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
      // Sökrutan går före allt annat, också när markören står i
      // anteckningsfältet: den ska svara likadant var i vyn man än befinner sig.
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowSwitcher(true);
        return;
      }

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
      <div className="relative flex flex-col items-center justify-center h-screen gap-4" style={{ background: "var(--bg)" }}>
        {/* Kön är slut — då är återkomsterna det som är kvar att göra. */}
        <div className="absolute top-4 right-5">
          <CallbackBell onOpenLead={openCallback} calledLead={calledLead} />
        </div>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          {refilling ? <Loader2 size={28} className="animate-spin" style={{ color: "var(--success)" }} /> : <Zap size={28} style={{ color: "var(--success)" }} />}
        </div>
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          {refilling ? "Hämtar fler..." : `${listName ?? "Kön"} är slut`}
        </h2>
        <p className="text-[14px] text-center max-w-[380px]" style={{ color: "var(--text-muted)" }}>
          {totalCalls} samtal denna session.
          {exhausted && " Inga fler leads är ringbara just nu — resten väntar på sin tur i uppföljningen."}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => router.push(listId ? `/lists/${listId}` : "/lists")} className="px-5 py-2 text-[13px] font-medium rounded-md" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
            {listId ? "Tillbaka till listan" : "Till ringlistorna"}
          </button>
          {/* Kön är slut, men ett bolag man vet namnet på går fortfarande att
              ringa — annars är enda vägen dit att lämna cockpiten. */}
          <button onClick={() => setShowSwitcher(true)} className="flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-md" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            <Search size={13} /> Sök bolag
          </button>
        </div>

        {showSwitcher && (
          <LeadSwitcher onClose={() => setShowSwitcher(false)} onPick={openSearched} />
        )}
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
            className="absolute top-[62px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg"
            style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
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
          <button onClick={() => router.push(listId ? `/lists/${listId}` : "/lists")} className="flex items-center gap-1 text-[13px] shrink-0" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={14} /> Avsluta
          </button>
          <span className="text-[13px]" style={{ color: "var(--border-strong)" }}>/</span>
          {/* Utan mapp är kön hela det egna däcket — säg det, i stället för att
              låta rubriken stå tom och se ut som ett fel. */}
          <span className="text-[13px] font-medium truncate" style={{ color: listName ? "var(--text)" : "var(--text-muted)" }}>
            {listName ?? "Alla mina leads"}
          </span>
          {currentSlotName && (
            <span className="text-[11px] px-2 py-[2px] rounded-full shrink-0" style={{ background: "var(--surface-inset)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
              {currentSlotName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <CallbackBell onOpenLead={openCallback} calledLead={calledLead} />
          <button
            onClick={() => setShowSwitcher(true)}
            title="Sök upp ett bolag (⌘K)"
            className="flex items-center gap-1.5 px-2 py-[3px] rounded-sm text-[11px] shrink-0"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
          >
            <Search size={11} /> <span className="tracking-wide">⌘K</span>
          </button>
          <PaceMeter
            totalCalls={totalCalls}
            idleSeconds={idleSeconds}
            elapsedSeconds={elapsedSeconds}
          />
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

      {/* Ramverket. Bandet går över hela bredden, kedjan över dashen. */}
      <FrameworkRail
        activeStep={flow.stage === "framework" ? endedAtStep : null}
        gutterClass={MANUS_COL}
        dashClass={DASH_W}
      />

      {/* Innehåll — dash till vänster, manus till höger. Två spalter med var
          sin scroll: säljaren ska aldrig behöva rulla bort kontaktuppgifterna
          för att komma åt manuset, eller tvärtom. */}
      <div className="flex-1 flex overflow-hidden">
        {/* VÄNSTER: dashen med trappan under sig. Trappan ligger i den här
            spalten och inte över hela bredden — under manuset blev den bara
            en tom vit yta, och manuset vinner höjden i stället. */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-start justify-center px-6 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={lead.id + contactIndex}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.09, ease: "easeOut" }}
                className={`w-full ${DASH_W} py-5`}
              >
                {/* Bolaget bytte ägare medan fliken låg och sov. Kön rensas
                    automatiskt, men det aktuella bolaget står kvar — säljaren
                    kan ha kunden på tråden. Bandet är då enda sättet att veta
                    att en kollega sitter i samma företag. */}
                {takenOver && takenOver.leadId === lead.id && (
                  <div
                    className="mb-3 flex items-center gap-2 px-3 py-[6px] rounded-md text-[12px] font-medium"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--danger)" }}
                  >
                    <AlertTriangle size={11} className="shrink-0" />
                    {takenOver.holder
                      ? `${takenOver.holder} har tagit över ${lead.companyName} — stäm av innan du ringer.`
                      : `En kollega har tagit över ${lead.companyName} — stäm av innan du ringer.`}
                  </div>
                )}

                {/* Uppslaget bolag. Bandet svarar på frågan säljaren annars
                    ställer sig: varför ligger det HÄR bolaget i kön, och vad är
                    det jag inte vet innan jag slår numret? Rotationens filter
                    gäller inte den som söker upp ett namn — men skälen till att
                    de finns ska stå framför näsan. */}
                {opened && opened.id === lead.id && (
                  <div className="mb-3 rounded-md overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div
                      className="flex items-center gap-2 px-3 py-[6px]"
                      style={{ borderBottom: opened.warnings.length > 0 ? "1px solid var(--border-subtle)" : undefined }}
                    >
                      <Search size={11} style={{ color: "var(--text-dim)" }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                        Uppslaget via sökningen
                      </span>
                    </div>
                    {opened.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-[6px] text-[12px] font-medium"
                        style={{
                          color: w.tone === "danger" ? "var(--danger)" : "var(--warning)",
                          borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                        }}
                      >
                        <AlertTriangle size={11} className="shrink-0" />
                        {w.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bolagsrubrik */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[15px] font-bold shrink-0"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}>
                    {lead.companyName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-[20px] leading-tight truncate" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
                      {lead.companyName}
                    </h1>
                    <div className="flex items-center gap-2 mt-[2px]">
                      {/* Branschen först och som egen bricka, inte i faktaraden
                          nedanför: den avgör vilken vinkel säljaren tar, och ska
                          gå att läsa i samma ögonkast som bolagsnamnet. */}
                      {lead.industry && (
                        <span
                          className="text-[11px] font-semibold px-2 py-[2px] rounded-full whitespace-nowrap"
                          style={{
                            background: "var(--accent-muted)",
                            color: "var(--accent)",
                            border: "1px solid var(--border-strong)",
                          }}
                          title={
                            lead.industrySource === "name"
                              ? "Gissad ur bolagsnamnet — bolaget saknar hemsida. Verifiera i samtalet."
                              : undefined
                          }
                        >
                          {lead.industry}
                          {/* Osäkra gissningar märks ut. En bransch härledd ur
                              enbart bolagsnamnet ska inte se lika trovärdig ut
                              som en som lästs av sajten — säljaren ska veta att
                              den är värd att kolla, inte att påstå. */}
                          {lead.industrySource === "name" && (
                            <span style={{ opacity: 0.65 }}> ?</span>
                          )}
                        </span>
                      )}
                      {lead.attemptCount > 0 && (
                        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                          Försök {lead.attemptCount + 1}
                        </span>
                      )}
                      {lead.callbackAt && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--accent)" }}>
                          {/* Tiden med, inte bara etiketten: säljaren ska kunna
                              öppna med "jag lovade höra av mig vid tvåtiden"
                              utan att lämna cockpiten. */}
                          <CalendarClock size={10} /> Lovad {formatWhen(new Date(lead.callbackAt))}
                        </span>
                      )}
                      {lead.contacts.length > 1 && (
                        <div className="flex items-center gap-1">
                          {lead.contacts.map((c, i) => (
                            <button key={c.id} onClick={() => setContactIndex(i)}
                              className="w-5 h-5 rounded-full text-[9px] font-bold transition-all"
                              style={{ background: i === contactIndex ? "var(--accent)" : "var(--surface-inset)", color: i === contactIndex ? "var(--on-accent)" : "var(--text-dim)", border: `1px solid ${i === contactIndex ? "var(--accent)" : "var(--border)"}` }}>
                              {c.name.charAt(0)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bolagsfakta från importen. Ligger direkt under rubriken och
                    före manuset: det är underlaget säljaren kvalificerar på, och
                    det får inte kräva att man lämnar cockpiten för att se det. */}
                {(lead.city || lead.address || lead.employees !== null || lead.revenue !== null) && (
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3 px-1">
                    {(lead.city || lead.address) && (
                      <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        <MapPin size={11} style={{ color: "var(--text-dim)" }} />
                        {[lead.address, lead.city].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {lead.employees !== null && (
                      <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        <Users size={11} style={{ color: "var(--text-dim)" }} />
                        {lead.employees.toLocaleString("sv-SE")} anställda
                      </span>
                    )}
                    {/* Utan valutasuffix — talet lagras som det stod i filen, och
                        exporterna blandar kronor och tkr utan att säga vilket. */}
                    {lead.revenue !== null && (
                      <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}
                        title="Omsättning, som den stod i importfilen">
                        <Banknote size={11} style={{ color: "var(--text-dim)" }} />
                        {lead.revenue.toLocaleString("sv-SE")}
                      </span>
                    )}
                    {lead.orgNumber && (
                      <span className="text-[11px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                        {lead.orgNumber}
                      </span>
                    )}
                  </div>
                )}

                {/* Kontaktkort */}
                {contact && (
                  <div className="rounded-lg p-5 mb-3"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        {/* Förnamn + efternamn när importen har dem var för sig.
                            Contact.name är visningsnamnet, men på rader där bara
                            ena delen råkade hamna där är de separata fälten mer
                            kompletta — och tilltalsnamnet är det säljaren säger. */}
                        <p className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
                          {contact.firstName && contact.lastName
                            ? `${contact.firstName} ${contact.lastName}`
                            : contact.name}
                        </p>
                        {contact.role && <p className="text-[13px] mt-[2px]" style={{ color: "var(--text-muted)" }}>{contact.role}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {websiteUrl && (
                          <button onClick={() => setDrawerTab("website")}
                            className="w-7 h-7 flex items-center justify-center rounded-sm"
                            style={{ background: drawerTab === "website" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "website" ? "var(--border-strong)" : "var(--border)"}` }}
                            title="Öppna hemsida">
                            <Globe size={12} style={{ color: drawerTab === "website" ? "var(--accent)" : "var(--text-muted)" }} />
                          </button>
                        )}
                        <button onClick={() => setDrawerTab("linkedin")}
                          className="w-7 h-7 flex items-center justify-center rounded-sm"
                          style={{ background: drawerTab === "linkedin" ? "var(--accent-muted)" : "var(--surface-inset)", border: `1px solid ${drawerTab === "linkedin" ? "var(--border-strong)" : "var(--border)"}` }}
                          title="Öppna LinkedIn">
                          <Linkedin size={12} style={{ color: drawerTab === "linkedin" ? "var(--accent)" : "var(--text-muted)" }} />
                        </button>
                      </div>
                    </div>

                    {/* Faller tillbaka på råtexten från importen när numret inte
                        gick att normalisera. Ett nummer som finns men ser ovanligt
                        ut ska visas ändå — annars tror säljaren att kontakten
                        saknar telefon, fast den står i filen. */}
                    <div className="flex flex-col gap-2">
                      {(contact.directPhoneE164 || contact.directPhone) && (
                        <a href={`tel:${contact.directPhoneE164 ?? contact.directPhone}`} className="flex items-center gap-3 px-4 py-3 rounded-lg"
                          style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
                            <Phone size={13} color="var(--bg)" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Direkttelefon</p>
                            <p className="text-[16px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                              {contact.directPhoneE164 ? formatSwedish(contact.directPhoneE164) : contact.directPhone}
                            </p>
                          </div>
                          <ExternalLink size={13} className="ml-auto" style={{ color: "var(--text-dim)" }} />
                        </a>
                      )}
                      {(contact.switchboardE164 || contact.switchboard) && (
                        <a href={`tel:${contact.switchboardE164 ?? contact.switchboard}`} className="flex items-center gap-3 px-4 py-3 rounded-lg"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                            <Building2 size={12} style={{ color: "var(--text-muted)" }} />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Växel</p>
                            <p className="text-[15px] font-medium" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                              {contact.switchboardE164 ? formatSwedish(contact.switchboardE164) : contact.switchboard}
                            </p>
                          </div>
                        </a>
                      )}
                      {contact.email && <EmailRow email={contact.email} />}
                    </div>
                  </div>
                )}

                {/* Historiken före anteckningsfältet: man läser vad som redan
                    sagts innan man skriver nytt. */}
                <LeadHistory
                  attempts={lead.callAttempts}
                  // Det som just sparats med Enter ligger först — leasens
                  // historik vet inget om det förrän nästa påfyllning.
                  activities={[...savedNotes, ...lead.activities]}
                />

                {/* Anteckning */}
                <div className="mb-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void commitNote();
                      }
                    }}
                    placeholder="Anteckning — Enter sparar, Shift+Enter ny rad"
                    rows={2}
                    className="w-full resize-none text-[13px] px-4 py-3 rounded-lg outline-none"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${noteError ? "var(--danger-border)" : "var(--border-strong)"}`,
                      color: "var(--text)",
                      lineHeight: 1.5,
                      opacity: savingNote ? 0.6 : 1,
                    }}
                  />
                  {noteError && (
                    <p className="text-[11px] mt-[3px] px-1" style={{ color: "var(--danger)" }}>
                      Anteckningen sparades inte — texten ligger kvar, försök igen.
                    </p>
                  )}
                </div>

                {/* Växelpanel */}
                {flow.stage === "gatekeeper" && (
                  <GatekeeperPanel
                    known={knownGk}
                    draft={gk}
                    onChange={setGk}
                    onSubmit={() => pickOutcome("GATEKEEPER_BLOCKED")}
                  />
                )}

                {/* Underlaget sist i dashen. Det är research om bolaget, inte
                    något säljaren läser högt — därför under kontakten och
                    anteckningen, inte före dem. */}
                <PitchPanel dossier={lead.dossier} />
                <SeoPanel dossier={lead.dossier} />

                {/* Under lg finns ingen manusspalt — då faller manuset tillbaka
                    hit, inline. Att tappa manuset på en smalare skärm vore värre
                    än att behöva scrolla efter det. */}
                <div className="lg:hidden">
                  <ScriptPanel scripts={lead.scripts} />
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottenfältet — allt som händer EFTER samtalet. Ligger i dashens spalt
              och får aldrig scrolla bort: trappan tas med sifferknappar, och
              muskelminnet kräver att den ligger still. */}
          <div
            className="shrink-0 border-t py-3 max-h-[52vh] overflow-y-auto flex justify-center px-6"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className={`w-full ${DASH_W}`}>
              {/* Återuppringningsdatum */}
              {askCallback && (
                <CallbackForm
                  draft={callback}
                  onChange={setCallback}
                  onSave={() =>
                    flow.result &&
                    commit({ result: flow.result, outcome: "CALLBACK_BOOKED", withGatekeeper: false })
                  }
                  onCancel={goBack}
                />
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

              {/* Navigering och tangentlathunden delar rad — bottenfältet är den
                  enda ytan som aldrig scrollar, och den ska inte äta höjd i onödan. */}
              <div className="flex items-center justify-between gap-3 mt-3">
                <p className="text-[10px] shrink-0" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  siffror = välj · backsteg = ångra · S skippa · ESC stäng panel
                </p>
                {flow.stage === "result" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={prevLead} disabled={index === 0}
                      className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-md"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: index === 0 ? 0.4 : 1 }}>
                      <ChevronLeft size={13} /> Föregående
                    </button>
                    <button onClick={skipLead}
                      className="flex items-center gap-1 text-[11px] px-3 py-2 rounded-md"
                      style={{ color: "var(--text-dim)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <SkipForward size={12} /> Skippa (S)
                    </button>
                    <button onClick={advance}
                      className="flex items-center gap-1 text-[12px] px-3 py-2 rounded-md"
                      style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      Nästa <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* HÖGER: manuset — det säljaren faktiskt säger. Går obruten från
            ramverksraden hela vägen ner, så en lång öppning aldrig trycker
            ner kontaktuppgifterna och ingen tom yta uppstår under den. */}
        <div
          className={`hidden lg:flex ${MANUS_COL} shrink-0 flex-col overflow-y-auto border-l px-5 py-5`}
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              key={lead.id + contactIndex}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.09, ease: "easeOut" }}
            >
              <ScriptPanel scripts={lead.scripts} />
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
              style={{ top: "52px", width: "62%", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-3)" }}>
              <div className="flex items-center justify-between px-4 h-[44px] border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-[2px] p-[2px] rounded-md" style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                  {websiteUrl && (
                    <button onClick={() => setDrawerTab("website")}
                      className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-sm"
                      style={{ background: drawerTab === "website" ? "var(--surface)" : "transparent", color: drawerTab === "website" ? "var(--text)" : "var(--text-dim)" }}>
                      <Globe size={11} /> Hemsida
                    </button>
                  )}
                  <button onClick={() => setDrawerTab("linkedin")}
                    className="flex items-center gap-1 px-2 py-[4px] text-[11px] font-medium rounded-sm"
                    style={{ background: drawerTab === "linkedin" ? "var(--surface)" : "transparent", color: drawerTab === "linkedin" ? "var(--text)" : "var(--text-dim)" }}>
                    <Linkedin size={11} /> LinkedIn
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <a href={drawerTab === "website" ? websiteUrl ?? "#" : linkedinUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm"
                    style={{ color: "var(--text-muted)", background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                    <ExternalLink size={11} /> Öppna
                  </a>
                  <button onClick={() => setDrawerTab(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-sm"
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
        <RegisterDealModal
          leadId={lead.id}
          companyName={lead.companyName}
          defaultContactName={contact?.name ?? null}
          defaultContactEmail={contact?.email ?? null}
          defaultContactPhone={contact?.directPhoneE164 ?? contact?.directPhone ?? null}
          // Avbryt skriver ingenting och tar en tillbaka till utfallsknapparna.
          // Ett feltryck på 3 ska gå att ta tillbaka, och en affär som inte
          // registrerades ska inte räknas som ett sälj.
          onClose={() => { setShowDealModal(false); setFlow((f) => ({ ...f, outcome: null })); }}
          // Affären är sparad — nu skrivs samtalet och kön går vidare.
          onCreated={() => {
            setShowDealModal(false);
            if (flow.result) commit({ result: flow.result, outcome: "SOLD" });
          }}
        />
      )}

      {showSwitcher && (
        <LeadSwitcher onClose={() => setShowSwitcher(false)} onPick={openSearched} />
      )}
    </div>
  );
}
