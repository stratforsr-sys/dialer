/**
 * Skriver ner en samtalshändelse från växeln och kopplar ihop den med det vi
 * redan vet: säljaren, leadet, kontakten och säljarens egen registrering.
 *
 * Ordningen är vald så att ingenting går förlorat om ett senare steg fallerar.
 * Rådatat skrivs FÖRST, i en egen transaktion, innan någon tolkning görs. Går
 * matchningen sedan sönder — okänt nummer, ny växelanvändare, en payload som
 * ser ut på ett sätt aliaslistorna inte tänkt på — står raden ändå kvar och
 * kan köras om. Motsatt ordning hade betytt att den första okända payloaden
 * kastades bort i just det ögonblick den var som mest värdefull.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { normalizePayload, type NormalizedCall } from "@/lib/telephony/normalize";
import type { AuthMethod } from "@/lib/telephony/verify";

const PROVIDER = "lynes";

/** Hur nära i tid ett växelsamtal och en säljarregistrering får ligga för att
 *  räknas som samma samtal. Tio minuter är rundligt tilltaget med flit:
 *  säljaren dispositionerar EFTER samtalet, ibland flera minuter efter, och
 *  kravet på samma säljare och samma nummer gör fönstret ofarligt brett. */
const ATTEMPT_MATCH_WINDOW_MS = 10 * 60 * 1000;

export interface IngestResult {
  eventId: string | null;
  duplicate: boolean;
  callId: string | null;
  matched: {
    agent: boolean;
    user: boolean;
    lead: boolean;
    attempt: boolean;
  };
  error?: string;
}

/**
 * Syntetiskt samtals-id när payloaden inte bär något vi känner igen.
 *
 * Utan det hamnar samtalet aldrig i TelephonyCall och statistiken blir tom
 * trots att råloggen fylls. Nyckeln är numren plus starttiden avrundad till
 * minuten — tillräckligt stabilt för att två leveranser om samma samtal ska
 * hamna på samma rad, och prefixet gör det synligt i databasen att id:t är
 * vår gissning och inte växelns.
 */
function syntheticCallId(n: NormalizedCall): string {
  const minute = n.startedAt
    ? new Date(Math.floor(n.startedAt.getTime() / 60000) * 60000).toISOString()
    : "okand-tid";
  const seed = `${n.fromRaw ?? "?"}|${n.toRaw ?? "?"}|${minute}`;
  return `synthetic:${createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
}

/**
 * Samma samtal som ett vi redan har en rad för?
 *
 * Lynes skickar INGEN samtalsidentifierare — verifierat mot en riktig
 * leverans. Utan en sådan blir varje händelse ett eget "samtal", och ett
 * samtal som rapporteras både när det börjar och när det slutar hamnar på två
 * rader med halva sanningen på var sin: den ena har starttid, den andra har
 * längd och inspelning. Ingen av dem är användbar.
 *
 * Regeln: finns redan ett OAVSLUTAT samtal mot samma motpart, av samma
 * växelanvändare, den senaste timmen — då är det samma samtal.
 *
 * Alla tre villkoren behövs. Utan agenten slås två säljares samtal till samma
 * bolag ihop. Utan `endedAt: null` skrivs ett avslutat samtal över av nästa
 * samtal till samma nummer. Utan tidsfönstret slås gårdagens ihop med dagens.
 */
async function openCallId(n: NormalizedCall, agentId: string | null): Promise<string | null> {
  if (!n.otherPartyE164 || !agentId) return null;

  const open = await db.telephonyCall.findFirst({
    where: {
      provider: PROVIDER,
      otherPartyE164: n.otherPartyE164,
      agentId,
      endedAt: null,
      startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { startedAt: "desc" },
    select: { providerCallId: true },
  });

  return open?.providerCallId ?? null;
}

/**
 * Hittar eller skapar växelanvändaren, och kopplar den till en User när
 * e-posten matchar exakt.
 *
 * Namnmatchning görs medvetet inte — se motiveringen i migration 017.
 */
async function resolveAgent(n: NormalizedCall) {
  if (!n.agentExternalId) return { agentId: null as string | null, userId: null as string | null };

  const existing = await db.telephonyAgent.findUnique({
    where: { provider_externalId: { provider: PROVIDER, externalId: n.agentExternalId } },
    select: { id: true, userId: true, email: true, extension: true, name: true },
  });

  // Auto-koppling bara om raden ännu inte är kopplad. En handkopplad agent får
  // aldrig flyttas av en payload — det är chefens beslut, inte växelns.
  let userId = existing?.userId ?? null;
  let autoLinked = false;
  if (!userId && n.agentEmail) {
    const user = await db.user.findFirst({
      where: { email: n.agentEmail.toLowerCase() },
      select: { id: true },
    });
    if (user) {
      userId = user.id;
      autoLinked = true;
    }
  }

  if (existing) {
    await db.telephonyAgent.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        // Fyll bara i det som saknas. Växeln kan skicka olika delmängder i
        // olika händelser, och en senare händelse utan e-post ska inte radera
        // en e-post en tidigare händelse gav oss.
        email: existing.email ?? n.agentEmail ?? undefined,
        extension: existing.extension ?? n.agentExtension ?? undefined,
        name: existing.name ?? n.agentName ?? undefined,
        ...(userId && !existing.userId ? { userId, autoLinked } : {}),
      },
    });
    return { agentId: existing.id, userId };
  }

  const created = await db.telephonyAgent.create({
    data: {
      provider: PROVIDER,
      externalId: n.agentExternalId,
      extension: n.agentExtension,
      email: n.agentEmail,
      name: n.agentName,
      userId,
      autoLinked,
    },
    select: { id: true },
  });
  return { agentId: created.id, userId };
}

/**
 * Vilket lead samtalet gäller, via motpartens nummer.
 *
 * Direktnummer före växelnummer: ett växelnummer delas av alla kontakter på
 * bolaget och pekar därför ut rätt LEAD men fel PERSON. Direktnumret pekar ut
 * båda. Hittas bara växelnumret sätts leadet men contactId lämnas tomt —
 * hellre okänd person än fel person.
 */
async function resolveLead(e164: string | null) {
  if (!e164) return { leadId: null as string | null, contactId: null as string | null };

  const direct = await db.contact.findFirst({
    where: { directPhoneE164: e164 },
    orderBy: { updatedAt: "desc" },
    select: { id: true, leadId: true },
  });
  if (direct) return { leadId: direct.leadId, contactId: direct.id };

  const board = await db.contact.findFirst({
    where: { switchboardE164: e164 },
    orderBy: { updatedAt: "desc" },
    select: { leadId: true },
  });
  if (board) return { leadId: board.leadId, contactId: null };

  return { leadId: null, contactId: null };
}

/**
 * Kopplar växelsamtalet till säljarens egen registrering, och fyller i det
 * växeln vet och säljaren inte kan veta.
 *
 * Två vägar in, i den ordningen:
 *   1. providerCallId står redan på registreringen — då är kopplingen exakt.
 *      (Kolumnen finns i schemat sedan dialer-grunden lades, just för det här.)
 *   2. Samma säljare, samma nummer, inom tio minuter, och registreringen
 *      saknar ännu ett providerCallId. Alla fyra villkoren behövs: utan
 *      säljarkravet stjäl en kollegas samtal kopplingen, utan nummerkravet
 *      hamnar inspelningen på fel bolag, och utan "saknar id" skrivs en redan
 *      korrekt koppling över av nästa samtal till samma nummer.
 *
 * Bara TOMMA fält fylls. Säljarens registrering är sanningen om vad som
 * hände i samtalet; växeln vet bara hur det gick tekniskt, och får aldrig
 * skriva över en siffra en människa satt.
 */
async function linkCallAttempt(
  n: NormalizedCall,
  providerCallId: string,
  userId: string | null,
  leadId: string | null
): Promise<string | null> {
  const byId = await db.callAttempt.findUnique({
    where: { providerCallId },
    select: { id: true, recordingUrl: true, durationSec: true, endedAt: true },
  });

  let attempt = byId;

  if (!attempt && userId && n.otherPartyE164) {
    const when = n.startedAt ?? n.answeredAt ?? n.endedAt ?? new Date();
    attempt = await db.callAttempt.findFirst({
      where: {
        sellerId: userId,
        providerCallId: null,
        ...(leadId ? { OR: [{ dialedE164: n.otherPartyE164 }, { leadId }] } : { dialedE164: n.otherPartyE164 }),
        startedAt: {
          gte: new Date(when.getTime() - ATTEMPT_MATCH_WINDOW_MS),
          lte: new Date(when.getTime() + ATTEMPT_MATCH_WINDOW_MS),
        },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true, recordingUrl: true, durationSec: true, endedAt: true },
    });
  }

  if (!attempt) return null;

  const data: Record<string, unknown> = {};
  if (!byId) data.providerCallId = providerCallId;
  if (!attempt.recordingUrl && n.recordingUrl) data.recordingUrl = n.recordingUrl;
  if (!attempt.endedAt && n.endedAt) data.endedAt = n.endedAt;
  // durationSec har DEFAULT 0, så noll betyder "aldrig satt" här.
  if (!attempt.durationSec && (n.talkSec ?? n.durationSec)) {
    data.durationSec = n.talkSec ?? n.durationSec;
  }

  if (Object.keys(data).length > 0) {
    try {
      await db.callAttempt.update({ where: { id: attempt.id }, data });
    } catch {
      // Unikhetskrocken på providerCallId är den enda realistiska: två
      // leveranser om samma samtal som behandlas samtidigt. Kopplingen finns
      // då redan och det är inget fel — men den får inte fälla mottagningen.
    }
  }

  return attempt.id;
}

/**
 * Tar emot EN händelse. Returnerar alltid — kastar aldrig vidare, eftersom
 * anroparen måste kunna svara växeln oavsett vad som gick fel här.
 */
export async function ingestEvent(
  payload: unknown,
  authMethod: AuthMethod
): Promise<IngestResult> {
  const n = normalizePayload(payload);
  const rawJson = safeStringify(payload);

  // ── Steg 1: rådatat, alltid, före all tolkning ──────────────────────────
  let eventId: string | null = null;
  try {
    const event = await db.telephonyEvent.create({
      data: {
        provider: PROVIDER,
        providerEventId: n.providerEventId,
        eventType: n.eventType,
        callId: n.providerCallId,
        authMethod,
        rawJson,
      },
      select: { id: true },
    });
    eventId = event.id;
  } catch (err) {
    // P2002 = unikhetskrock på (provider, providerEventId): samma leverans
    // igen. Växlar levererar om vid timeout och det är inget fel — men den
    // andra kopian ska inte behandlas en gång till.
    if (isUniqueViolation(err)) {
      return {
        eventId: null,
        duplicate: true,
        callId: n.providerCallId,
        matched: { agent: false, user: false, lead: false, attempt: false },
      };
    }
    throw err;
  }

  // ── Steg 2: tolkningen. Fel här får inte kasta bort råraden ─────────────
  try {
    const { agentId, userId } = await resolveAgent(n);
    const { leadId, contactId } = await resolveLead(n.otherPartyE164);

    // Agenten måste vara löst FÖRE samtals-id:t: saknar payloaden id är det
    // agenten plus motparten som avgör om det här är ett pågående samtal vi
    // redan känner till. Se openCallId.
    const providerCallId =
      n.providerCallId ?? (await openCallId(n, agentId)) ?? syntheticCallId(n);

    const call = await db.telephonyCall.upsert({
      where: { provider_providerCallId: { provider: PROVIDER, providerCallId } },
      create: {
        provider: PROVIDER,
        providerCallId,
        direction: n.direction,
        status: n.status,
        lastEventType: n.eventType,
        fromRaw: n.fromRaw,
        toRaw: n.toRaw,
        fromE164: n.fromE164,
        toE164: n.toE164,
        otherPartyE164: n.otherPartyE164,
        startedAt: n.startedAt,
        answeredAt: n.answeredAt,
        endedAt: n.endedAt,
        durationSec: n.durationSec,
        talkSec: n.talkSec,
        waitSec: n.waitSec,
        hangupCause: n.hangupCause,
        queueName: n.queueName,
        recordingUrl: n.recordingUrl,
        recordingId: n.recordingId,
        agentId,
        userId,
        leadId,
        contactId,
        eventCount: 1,
      },
      // Uppdateringen är genomgående "nytt värde om det finns, annars behåll".
      // Ett samtal beskrivs av flera händelser och den sista bär sällan allt:
      // "avslutat" har sluttid men kanske inte vem som ringde, och
      // "inspelning klar" har bara URL:en. `?? undefined` gör att Prisma
      // hoppar över fältet helt i stället för att skriva NULL.
      update: {
        direction: n.direction ?? undefined,
        status: n.status === "UNKNOWN" ? undefined : n.status,
        lastEventType: n.eventType ?? undefined,
        fromRaw: n.fromRaw ?? undefined,
        toRaw: n.toRaw ?? undefined,
        fromE164: n.fromE164 ?? undefined,
        toE164: n.toE164 ?? undefined,
        otherPartyE164: n.otherPartyE164 ?? undefined,
        startedAt: n.startedAt ?? undefined,
        answeredAt: n.answeredAt ?? undefined,
        endedAt: n.endedAt ?? undefined,
        durationSec: n.durationSec ?? undefined,
        talkSec: n.talkSec ?? undefined,
        waitSec: n.waitSec ?? undefined,
        hangupCause: n.hangupCause ?? undefined,
        queueName: n.queueName ?? undefined,
        recordingUrl: n.recordingUrl ?? undefined,
        recordingId: n.recordingId ?? undefined,
        agentId: agentId ?? undefined,
        userId: userId ?? undefined,
        leadId: leadId ?? undefined,
        contactId: contactId ?? undefined,
        eventCount: { increment: 1 },
        updatedAt: new Date(),
      },
      select: { id: true, callAttemptId: true },
    });

    // Kopplingen till säljarens registrering görs bara en gång per samtal.
    let attemptId = call.callAttemptId;
    if (!attemptId) {
      attemptId = await linkCallAttempt(n, providerCallId, userId, leadId);
      if (attemptId) {
        await db.telephonyCall.update({
          where: { id: call.id },
          data: { callAttemptId: attemptId },
        });
      }
    }

    await db.telephonyEvent.update({
      where: { id: eventId },
      data: { handled: true, callId: providerCallId },
    });

    return {
      eventId,
      duplicate: false,
      callId: providerCallId,
      matched: {
        agent: Boolean(agentId),
        user: Boolean(userId),
        lead: Boolean(leadId),
        attempt: Boolean(attemptId),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Felet skrivs på råraden i stället för att kastas: den som felsöker vill
    // se payloaden OCH vad som gick fel på samma ställe.
    await db.telephonyEvent
      .update({ where: { id: eventId }, data: { handled: false, error: message.slice(0, 500) } })
      .catch(() => {});
    return {
      eventId,
      duplicate: false,
      callId: n.providerCallId,
      matched: { agent: false, user: false, lead: false, attempt: false },
      error: message,
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** JSON som inte kan kasta. En payload med cykler eller BigInt får aldrig
 *  hindra att raden skrivs — då är det bättre att spara felmeddelandet. */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "null";
  } catch (err) {
    return JSON.stringify({
      _serializeError: err instanceof Error ? err.message : String(err),
      _typeof: typeof v,
    });
  }
}
