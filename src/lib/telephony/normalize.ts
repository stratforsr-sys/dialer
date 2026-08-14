/**
 * Tolkar en webhook-payload från växeln utan att veta hur den ser ut.
 *
 * Lynes publicerar ingen fältreferens. I stället för att gissa ett schema och
 * få 100 % fel om gissningen är fel, plattas payloaden ut till en lista av
 * (sökväg, värde) och varje fält plockas ut med en aliaslista plus ett
 * typtest. Det gör tolkningen okänslig för både namngivning (`callId`,
 * `call_id`, `uuid`) och nästling (`{call:{id}}`, `{data:{call:{id}}}`).
 *
 * Typtestet är det som gör aliaslistorna säkra att göra breda: aliaset "id"
 * accepteras bara som samtals-id, "duration" bara om värdet är ett tal i
 * rimligt intervall, ett nummerfält bara om värdet ser ut som ett telefon-
 * nummer. Utan det hade ett brett alias plockat fel fält i en payload som
 * råkar ha samma ord på ett annat ställe.
 *
 * Rena funktioner, inga beroenden — testbara utan databas.
 */

import { toE164 } from "@/lib/phone";

/** En utplattad payload: sökväg i punktnotation → primitivt värde. */
export type FlatPayload = Array<{ path: string; key: string; value: unknown }>;

/**
 * Plattar ut godtyckligt djup JSON. Arrayer indexeras (`legs.0.number`) men
 * matchas också utan index, så att `legs[].number` hittas av aliaset "number".
 *
 * Djupet är begränsat till 8 nivåer: en payload som är djupare än så är
 * antingen cyklisk eller inte en samtalshändelse, och båda fallen ska inte
 * kunna hänga en webhook-handler som en växel väntar på svar från.
 */
export function flatten(input: unknown, maxDepth = 8): FlatPayload {
  const out: FlatPayload = [];
  const seen = new WeakSet<object>();

  function walk(node: unknown, path: string, depth: number): void {
    if (node === null || node === undefined) return;
    if (depth > maxDepth) return;

    if (typeof node === "object") {
      if (seen.has(node as object)) return;
      seen.add(node as object);

      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), depth + 1));
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
      return;
    }

    // Primitiv. Nyckeln är sista ledet utan arrayindex.
    const segments = path.split(".").filter((s) => !/^\d+$/.test(s));
    const key = (segments[segments.length - 1] ?? path).toLowerCase();
    out.push({ path: path.toLowerCase(), key, value: node });
  }

  walk(input, "", 0);
  return out;
}

type Predicate = (value: unknown) => boolean;

/**
 * Första värdet vars nyckel matchar något alias och som klarar typtestet.
 *
 * Aliasen prövas i tur och ordning, inte payloadens ordning: står "callid"
 * före "id" i listan vinner `callId` även om `id` ligger först i objektet.
 * Det är hela poängen med ordningen — de specifika aliasen är de pålitliga.
 *
 * Två nivåer per alias, i den ordningen:
 *
 *   1. Aliaset ÄR fältet. `duration`, `call.duration`, `data.call.duration`.
 *   2. Aliaset är en behållare någonstans i sökvägen. `caller` matchar
 *      `data.call.caller.number` — nästlingen är okänd, så det räcker inte
 *      att titta i roten.
 *
 * Nivå 2 är bredare än nivå 1 och prövas därför bara när nivå 1 gick tom.
 * Utan den ordningen hade ett behållarnamn kunnat sno åt sig ett värde som
 * ett exakt fältnamn längre ned i listan skulle ha ägt.
 */
function pick(flat: FlatPayload, aliases: string[], test: Predicate): unknown {
  for (const alias of aliases) {
    for (const entry of flat) {
      const exact =
        entry.key === alias || entry.path === alias || entry.path.endsWith(`.${alias}`);
      if (exact && test(entry.value)) return entry.value;
    }
    for (const entry of flat) {
      if (entry.path.split(".").includes(alias) && test(entry.value)) return entry.value;
    }
  }
  return undefined;
}

// ── Typtest ────────────────────────────────────────────────────────────────

const isNonEmptyString: Predicate = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Ser det ut som ett nummer man kan ringa? Bara siffror och formateringstecken.
 * Stoppar att ett alias som "to" plockar en e-postadress eller ett namn.
 *
 * Tröskeln är tre siffror, inte åtta, eftersom ANKNYTNINGAR måste rymmas: i
 * ett utgående samtal är avsändaren "1042" och inget annat. Fångas den inte
 * går riktningen inte att härleda, och då pekas fel part ut som motpart och
 * samtalet matchas mot fel bolag. Att skilja anknytning från publikt nummer
 * görs sedan av toE164, som returnerar null för det som inte går att tolka.
 */
const looksLikePhone: Predicate = (v) => {
  if (typeof v === "number") return Number.isInteger(v) && String(Math.abs(v)).length >= 3;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!/^\+?[\d\s\-().]{3,24}$/.test(s)) return false;
  return (s.match(/\d/g)?.length ?? 0) >= 3;
};

const looksLikeUrl: Predicate = (v) =>
  typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

/**
 * Ett tal som kan vara en samtalslängd — i sekunder ELLER millisekunder.
 *
 * Taket låg först på 86400 ("ett dygn i sekunder") i tron att det fångade
 * millisekunder. Det gjorde tvärtom: Lynes skickar millisekunder, så varje
 * samtal längre än 86,4 sekunder föll över taket och fick sin längd tyst
 * förkastad. De korta blev kvar och var 1000 gånger för långa. Värsta
 * kombinationen — data som finns, ser rimlig ut och är fel.
 *
 * Taket är nu ett dygn i MILLISEKUNDER. Enheten avgörs i toSeconds.
 */
const looksLikeSeconds: Predicate = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 86_400_000;
};

/** ISO-sträng, "YYYY-MM-DD HH:MM:SS", eller epoch i sekunder/millisekunder. */
const looksLikeTimestamp: Predicate = (v) => parseTimestamp(v) !== null;

const isBooleanish: Predicate = (v) =>
  typeof v === "boolean" ||
  (typeof v === "string" && /^(true|false|yes|no|1|0)$/i.test(v.trim()));

// ── Konverterare ───────────────────────────────────────────────────────────

/**
 * Till Date, eller null.
 *
 * Epoch tolkas efter storlek: under 1e11 är sekunder, över är millisekunder.
 * Gränsen ligger vid år 5138 i sekunder respektive 1973 i millisekunder — inga
 * samtal finns i någotdera intervallet, så tolkningen är entydig i praktiken.
 *
 * Datum utanför [2000, nu + 1 dygn] förkastas. Ett samtal daterat 1970 är en
 * feltolkad nolla, och en sådan rad förstör varje statistikfråga som sorterar
 * på tid.
 */
export function parseTimestamp(v: unknown): Date | null {
  let d: Date | null = null;

  if (typeof v === "number" && Number.isFinite(v)) {
    d = new Date(v < 1e11 ? v * 1000 : v);
  } else if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d{9,14}$/.test(s)) {
      const n = Number(s);
      d = new Date(n < 1e11 ? n * 1000 : n);
    } else {
      // "2026-08-13 14:02:11" utan tidszon tolkas som UTC av Date i Node men
      // som lokal tid i vissa miljöer. Normalisera till ISO med Z så att
      // resultatet blir detsamma överallt.
      const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)
        ? `${s.replace(" ", "T")}Z`
        : s;
      d = new Date(iso);
    }
  }

  if (!d || Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2000 || d.getTime() > Date.now() + 86_400_000) return null;
  return d;
}

/**
 * Till sekunder, oavsett vilken enhet providern skickade.
 *
 * Lynes skickar MILLISEKUNDER. Det är mätt, inte gissat: över tretton
 * leveranser låg `mottagningstid − startTime` konsekvent inom en halv sekund
 * från `duration / 1000` (7000 → 9,2 s; 51000 → 51,6 s; 78000 → 78,4 s).
 * Samma payload skickar dessutom `startTime` som epoch i millisekunder, så
 * enheten är genomgående.
 *
 * Två tecken på millisekunder, och det räcker med ett:
 *
 *   1. Jämnt delbart med 1000. En äkta sekundlängd som råkar bli exakt 5000
 *      sekunder är ett samtal på 83 minuter — det händer inte i kalla samtal,
 *      medan 5000 ms (5 sekunder) är vardag.
 *   2. Större än 86400. Som sekunder vore det över ett dygn.
 *
 * Kvar som osäkert: en längd i millisekunder som INTE är jämna sekunder,
 * t.ex. 1500. Den läses som 1500 sekunder. Lynes skickar bara jämna
 * tusental, så fallet är teoretiskt — men det är den kvarvarande svagheten.
 */
function toSeconds(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;

  const isMillis = (n >= 1000 && n % 1000 === 0) || n > 86400;
  const seconds = isMillis ? n / 1000 : n;

  if (seconds > 86400) return null;
  return Math.round(seconds);
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return typeof v === "string" && /^(true|yes|1)$/i.test(v.trim());
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

// ── Aliaslistor ────────────────────────────────────────────────────────────
//
// Ordningen är betydelsebärande: specifikt före generiskt. Listorna täcker de
// namngivningar som är vanliga hos europeiska växelleverantörer (Asterisk- och
// FreeSWITCH-arv: uniqueid, billsec, calleridnum) plus de rena camelCase- och
// snake_case-varianterna. Det breda greppet är avsiktligt — vi vet inte vilken
// familj Lynes tillhör, och ett alias för mycket kostar ingenting när
// typtestet ändå måste passera.

const CALL_ID = [
  "callid", "call_id", "calluuid", "call_uuid", "callreference", "conversationid",
  "conversation_id", "sessionid", "session_id", "uniqueid", "unique_id", "linkedid",
  "uuid", "reference", "id",
];

const EVENT_ID = [
  "eventid", "event_id", "webhookid", "webhook_id", "deliveryid", "delivery_id",
  "messageid", "message_id", "notificationid",
];

const EVENT_TYPE = [
  // itemType först. Lynes skickar `itemType: "OUTGOING_CALL"` OCH
  // `callType: "Inbound"` i samma payload, och de säger emot varandra —
  // se DIRECTION nedan för vilken som är sann.
  "itemtype", "item_type",
  "eventtype", "event_type", "event", "action", "trigger",
  "callstatus", "call_status", "status", "state", "calltype", "type",
];

// itemType före callType, och det är inte en detalj: i den första riktiga
// Lynes-payloaden stod `itemType: "OUTGOING_CALL"` bredvid
// `callType: "Inbound"`. itemType är den som stämmer — den överensstämmer både
// med payloadens egen bodytext ("Call from user: <säljarens adress>") och med
// vilket av numren som tillhör bolaget. callType beskriver något annat,
// troligen benet in mot växeln. Väljs fel pekas SÄLJARENS eget nummer ut som
// motpart, och samtalet matchas mot fel bolag eller inget alls.
const DIRECTION = [
  "itemtype", "item_type", "direction", "calldirection", "call_direction",
  "calltype", "call_type", "way", "leg",
];

const FROM = [
  "fromnumber", "from_number", "callernumber", "caller_number", "callerid",
  "caller_id", "calleridnum", "anumber", "a_number", "anr", "originator",
  "sourcenumber", "source_number", "from", "caller", "source",
];

const TO = [
  "tonumber", "to_number", "callednumber", "called_number", "calledparty",
  "dialednumber", "dialed_number", "bnumber", "b_number", "bnr",
  "destinationnumber", "destination_number", "to", "called", "callee",
  "destination", "dialed",
];

const STARTED_AT = [
  "starttime", "start_time", "startedat", "started_at", "calltime", "call_time",
  "initiatedat", "createdat", "created_at", "datetime", "date", "timestamp", "start",
];

const ANSWERED_AT = [
  "answertime", "answer_time", "answeredat", "answered_at", "connectedat",
  "connected_at", "bridgedat", "bridged_at", "answered",
];

const ENDED_AT = [
  "endtime", "end_time", "endedat", "ended_at", "hanguptime", "hangup_time",
  "disconnectedat", "disconnected_at", "completedat", "completed_at",
  "finishedat", "end",
];

const DURATION = [
  "durationseconds", "duration_seconds", "durationsec", "duration_sec",
  "callduration", "call_duration", "totalduration", "total_duration",
  "duration", "length",
];

const TALK_SEC = [
  "talktime", "talk_time", "talksec", "talk_sec", "talkduration",
  "conversationduration", "answeredduration", "billsec", "billableseconds",
  "connectedduration",
];

const WAIT_SEC = [
  "waittime", "wait_time", "ringtime", "ring_time", "ringduration",
  "ringingduration", "queuetime", "queue_time", "holdtime", "waitsec",
];

const RECORDING_URL = [
  "recordingurl", "recording_url", "recordinglink", "recording_link",
  "recordingfile", "audiourl", "audio_url", "mediaurl", "media_url",
  "downloadurl", "download_url", "voicerecording", "recording",
];

const RECORDING_ID = [
  "recordingid", "recording_id", "recordinguuid", "recordingreference",
];

const HANGUP_CAUSE = [
  "hangupcause", "hangup_cause", "hangupreason", "endreason", "end_reason",
  "disconnectreason", "disconnect_reason", "terminationreason", "cause",
  "reason", "result",
];

const QUEUE = [
  "queuename", "queue_name", "responsegroup", "response_group", "groupname",
  "department", "queue", "group",
];

// Växelanvändaren plockas inte med samma aliaslista som allt annat, utan med
// en egen funktion. Skälet är att just de här fälten heter generiska saker —
// `id`, `name`, `email` — och ligger inuti en behållare: `user.id`,
// `data.call.agent.displayName`. Ett brett alias som "user" hade i stället
// tagit första bästa värde under behållaren, vilket i praktiken blev
// användarens id i namnfältet.

/** Objektnamn som brukar omsluta växelanvändaren. */
const AGENT_CONTAINERS = [
  "user", "agent", "operator", "employee", "member", "assignee", "owner",
  "answeredby", "handledby", "seller", "extensionuser",
];

/** Nycklar som är entydiga i sig och får matcha var som helst i payloaden. */
const AGENT_ID_KEYS = [
  "userid", "user_id", "agentid", "agent_id", "operatorid", "employeeid",
  "memberid", "extensionid",
];
const AGENT_NAME_KEYS = [
  "agentname", "agent_name", "username", "user_name", "displayname",
  "display_name", "fullname", "full_name", "operatorname", "employeename",
];
const AGENT_EMAIL_KEYS = [
  "useremail", "user_email", "agentemail", "agent_email", "operatoremail",
  "email", "mail",
];
const AGENT_EXT_KEYS = [
  "extension", "extensionnumber", "ext", "anknytning", "internalnumber",
  "shortnumber",
];

/** Generiska nycklar — accepteras bara inuti en av behållarna ovan. */
const AGENT_ID_IN_CONTAINER = ["id", "uuid", "guid", "number"];
const AGENT_NAME_IN_CONTAINER = ["name", "title", "label"];

function inAgentContainer(path: string): boolean {
  const segments = path.split(".");
  // Sista ledet är fältnamnet självt och räknas inte som behållare.
  return segments.slice(0, -1).some((s) => AGENT_CONTAINERS.includes(s));
}

/**
 * Sista utväg för att identifiera säljaren: leta e-postadress i fritext.
 *
 * Lynes lägger användaren i ett människoläsbart fält och ingen annanstans:
 *
 *     "body": "Call to: +46…\nCall from user: namn@företaget.se (+46…)\n…"
 *
 * Strukturerat finns bara ett `userId` med ett UUID, som inte går att koppla
 * till någon `User` hos oss. Utan den här funktionen blir alltså varje samtal
 * tillskrivet ingen alls — och statistik per säljare är hela poängen.
 *
 * Villkoret att det ska finnas EXAKT en unik adress i hela payloaden är
 * avsiktligt strängt. Två adresser betyder att vi inte vet vilken som är
 * växelanvändarens, och att gissa fel tillskriver en kollega samtalet — vilket
 * är värre än att lämna det otillskrivet, eftersom felet inte syns.
 */
function emailFromFreeText(flat: FlatPayload): string | null {
  const found: string[] = [];
  for (const entry of flat) {
    if (typeof entry.value !== "string") continue;
    const matches = entry.value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
    if (!matches) continue;
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (!found.includes(lower)) found.push(lower);
    }
  }
  return found.length === 1 ? found[0] : null;
}

function agentField(
  flat: FlatPayload,
  specificKeys: string[],
  containerKeys: string[],
  test: Predicate
): string | null {
  for (const k of specificKeys) {
    const hit = flat.find((e) => e.key === k && test(e.value));
    if (hit) return str(hit.value);
  }
  for (const k of containerKeys) {
    const hit = flat.find((e) => e.key === k && inAgentContainer(e.path) && test(e.value));
    if (hit) return str(hit.value);
  }
  return null;
}

const VOICEMAIL = ["voicemail", "isvoicemail", "leftvoicemail", "hasvoicemail"];

// ── Resultatet ─────────────────────────────────────────────────────────────

/** Grov, härledd samtalsstatus. Rå eventType sparas alltid vid sidan om. */
export type TelephonyStatus =
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "FAILED"
  | "VOICEMAIL"
  | "UNKNOWN";

export interface NormalizedCall {
  providerCallId: string | null;
  providerEventId: string | null;
  eventType: string | null;
  status: TelephonyStatus;
  direction: "OUTBOUND" | "INBOUND" | null;

  fromRaw: string | null;
  toRaw: string | null;
  fromE164: string | null;
  toE164: string | null;
  otherPartyE164: string | null;

  startedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;

  durationSec: number | null;
  talkSec: number | null;
  waitSec: number | null;

  hangupCause: string | null;
  queueName: string | null;
  recordingUrl: string | null;
  recordingId: string | null;

  agentExternalId: string | null;
  agentExtension: string | null;
  agentEmail: string | null;
  agentName: string | null;

  voicemail: boolean;
}

/**
 * Härleder grov status ur eventtyp, orsak och tider.
 *
 * Text före tider: en payload som säger "no_answer" ska bli NO_ANSWER även om
 * den råkar ha en sluttid. Tiderna används bara när texten inte räcker.
 */
function deriveStatus(
  eventType: string | null,
  hangupCause: string | null,
  answeredAt: Date | null,
  endedAt: Date | null,
  talkSec: number | null,
  durationSec: number | null,
  voicemail: boolean
): TelephonyStatus {
  const t = `${eventType ?? ""} ${hangupCause ?? ""}`.toLowerCase();

  if (voicemail || /voicemail|voice_mail|röstbrevlåda|telesvar/.test(t)) return "VOICEMAIL";
  if (/busy|upptaget|user_busy/.test(t)) return "BUSY";
  if (/no[_\s-]?answer|noanswer|missed|unanswered|obesvarad|missat|timeout|cancel|abandon/.test(t))
    return "NO_ANSWER";
  if (/fail|error|congestion|rejected|unavailable|invalid|misslyck/.test(t)) return "FAILED";

  // Samtalsposter (`itemType: OUTGOING_CALL` / `INCOMING_CALL`).
  //
  // RÄTTELSE till en tidigare tolkning här: den första leveransen såg ut att
  // komma i samma sekund som samtalet BÖRJADE, och nollan i duration lästes
  // därför som "har inte hänt än" → RINGING. Fel. Mätt över tretton
  // leveranser ligger mottagningstiden konsekvent `startTime + duration`,
  // alltså rapporterar Lynes EFTER samtalet. Den första hade duration 0 för
  // att samtalet faktiskt var noll sekunder långt — ingen svarade.
  //
  // Nollan betyder alltså obesvarat, och det är den tolkningen som gäller.
  if (/outgoing_call|incoming_call|call_item|calllog|call_log/.test(t)) {
    return (talkSec ?? 0) > 0 || (durationSec ?? 0) > 0 ? "COMPLETED" : "NO_ANSWER";
  }
  if (/ring|initiat|dial|start|calling|setup|new/.test(t) && !/end|hangup|complet/.test(t))
    return "RINGING";
  if (/end|hangup|complet|finish|disconnect|avslut|terminated/.test(t)) {
    // Avslutat utan att ha varit uppkopplat är inte ett genomfört samtal.
    if (answeredAt || (talkSec !== null && talkSec > 0)) return "COMPLETED";
    if (answeredAt === null && talkSec === 0) return "NO_ANSWER";
    return "COMPLETED";
  }
  if (/answer|connect|bridge|established|svarat/.test(t)) return "ANSWERED";

  // Ingen begriplig text — falla tillbaka på tiderna.
  if (endedAt) return answeredAt || (talkSec ?? 0) > 0 ? "COMPLETED" : "NO_ANSWER";
  if (answeredAt) return "ANSWERED";
  return "UNKNOWN";
}

/**
 * Riktningen, som text när den finns och annars gissad ur numren.
 *
 * Gissningen: ringer växeln UT går samtalet till ett externt nummer, alltså är
 * `to` det långa publika numret och `from` en anknytning. Är bara ett av
 * numren en anknytning (färre än 6 siffror efter normalisering misslyckats)
 * avgör det. Går det inte att avgöra returneras null — ett gissat OUTBOUND på
 * ett inkommande samtal pekar ut fel motpart och matchar fel lead.
 */
function deriveDirection(
  raw: string | null,
  fromE164: string | null,
  toE164: string | null,
  fromRaw: string | null,
  toRaw: string | null
): "OUTBOUND" | "INBOUND" | null {
  const t = (raw ?? "").toLowerCase();
  if (/out|utg|outbound|originat/.test(t)) return "OUTBOUND";
  if (/in\b|inbound|inkom|incoming|terminat/.test(t)) return "INBOUND";

  const fromIsExtension = !fromE164 && !!fromRaw && fromRaw.replace(/\D/g, "").length <= 5;
  const toIsExtension = !toE164 && !!toRaw && toRaw.replace(/\D/g, "").length <= 5;

  if (fromIsExtension && !toIsExtension) return "OUTBOUND";
  if (toIsExtension && !fromIsExtension) return "INBOUND";
  return null;
}

/** Tolkar en payload. Kastar aldrig — en trasig payload ger tomma fält, och
 *  rådatat finns kvar i TelephonyEvent för den som vill titta efteråt. */
export function normalizePayload(payload: unknown): NormalizedCall {
  const flat = flatten(payload);

  const eventType = str(pick(flat, EVENT_TYPE, isNonEmptyString));
  const fromRaw = str(pick(flat, FROM, looksLikePhone));
  const toRaw = str(pick(flat, TO, looksLikePhone));
  const fromE164 = toE164(fromRaw);
  const toE164Value = toE164(toRaw);

  const startedAt = parseTimestamp(pick(flat, STARTED_AT, looksLikeTimestamp));
  const answeredAt = parseTimestamp(pick(flat, ANSWERED_AT, looksLikeTimestamp));
  const reportedEndedAt = parseTimestamp(pick(flat, ENDED_AT, looksLikeTimestamp));

  const durationSec = toSeconds(pick(flat, DURATION, looksLikeSeconds));
  const talkSec = toSeconds(pick(flat, TALK_SEC, looksLikeSeconds));
  const waitSec = toSeconds(pick(flat, WAIT_SEC, looksLikeSeconds));

  const hangupCause = str(pick(flat, HANGUP_CAUSE, isNonEmptyString));
  const voicemail = toBool(pick(flat, VOICEMAIL, isBooleanish));

  // Sluttiden härleds när providern bara skickar start och längd.
  //
  // Lynes skickar ingen sluttid alls, men rapporterar efter samtalet — mätt:
  // mottagningstiden ligger `startTime + duration` plus en halv sekund. Finns
  // en längd är samtalet alltså över, och utan det här står varje samtal kvar
  // som pågående för alltid. Det får två följder som båda är fel: statistiken
  // hittar aldrig ett avslutat samtal, och `openCallId` slår ihop nästa samtal
  // till samma bolag med det förra, eftersom det letar efter oavslutade rader.
  const endedAt =
    reportedEndedAt ??
    (startedAt && durationSec !== null
      ? new Date(startedAt.getTime() + durationSec * 1000)
      : null);

  const direction = deriveDirection(
    str(pick(flat, DIRECTION, isNonEmptyString)),
    fromE164,
    toE164Value,
    fromRaw,
    toRaw
  );

  // Motparten. Utan känd riktning: det nummer som faktiskt gick att
  // normalisera är motparten, eftersom en anknytning aldrig gör det.
  const otherPartyE164 =
    direction === "OUTBOUND"
      ? toE164Value
      : direction === "INBOUND"
        ? fromE164
        : (toE164Value ?? fromE164);

  const agentEmail =
    agentField(flat, AGENT_EMAIL_KEYS, [], (v) => {
      const s = str(v);
      return !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
    }) ?? emailFromFreeText(flat);
  const agentExtension = agentField(flat, AGENT_EXT_KEYS, [], (v) => {
    const s = str(v);
    return !!s && /^\d{1,6}$/.test(s);
  });
  const agentId = agentField(flat, AGENT_ID_KEYS, AGENT_ID_IN_CONTAINER, isNonEmptyString);
  const agentName = agentField(
    flat,
    AGENT_NAME_KEYS,
    AGENT_NAME_IN_CONTAINER,
    // Ett namn är inte ett nummer och inte en e-postadress. Utan det testet
    // blir "1042" säljarens namn i chefsvyn.
    (v) => isNonEmptyString(v) && !looksLikePhone(v) && !String(v).includes("@")
  );

  return {
    providerCallId: str(pick(flat, CALL_ID, isNonEmptyString)),
    providerEventId: str(pick(flat, EVENT_ID, isNonEmptyString)),
    eventType,
    status: deriveStatus(
      eventType, hangupCause, answeredAt, endedAt, talkSec, durationSec, voicemail
    ),
    direction,

    fromRaw,
    toRaw,
    fromE164,
    toE164: toE164Value,
    otherPartyE164,

    startedAt,
    answeredAt,
    endedAt,

    durationSec,
    talkSec,
    waitSec,

    hangupCause,
    queueName: str(pick(flat, QUEUE, isNonEmptyString)),
    recordingUrl: str(pick(flat, RECORDING_URL, looksLikeUrl)),
    recordingId: str(pick(flat, RECORDING_ID, isNonEmptyString)),

    agentExternalId: agentId ?? agentExtension ?? agentEmail ?? agentName,
    agentExtension,
    agentEmail,
    agentName,

    voicemail,
  };
}

/**
 * Delar upp en leverans i enskilda händelser.
 *
 * En växel skickar antingen ett objekt eller en batch. Batchen kan ligga
 * direkt som en array i roten, eller under `events`/`data`/`calls`/`items` —
 * alla fyra förekommer i naturen och kostar ingenting att stödja.
 */
export function splitDeliveries(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["events", "data", "calls", "items", "records", "payload"]) {
      const v = obj[key];
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return [body];
}
