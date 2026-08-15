/**
 * Kopplar ihop säljarens registrering med växelns bild av samma samtal —
 * från REGISTRERINGENS håll.
 *
 * `ingest.ts` gör redan motsvarande koppling när en webhook kommer in. Den
 * täcker bara ett av två fall, och i praktiken det ovanliga: Lynes rapporterar
 * i samma ögonblick som luren läggs på, medan säljaren dispositionerar
 * sekunderna EFTER. Webhooken kommer alltså först, och letar då efter en rad
 * som ännu inte finns.
 *
 * Mätt i produktionsdata den 14 augusti 2026, på 471 utgående samtal:
 *
 *     dispositionen skrevs EFTER webhooken kom      368
 *     dispositionen fanns redan när webhooken kom     13
 *     ingen disposition alls                          63
 *
 * Trettio samtal av 508 hade en koppling. Resten låg som två halva sanningar
 * bredvid varandra — växeln med samtalslängden, säljaren med utfallet — och
 * ingen fråga kunde ställas som behövde båda.
 *
 * Därför den här riktningen: när dispositionen skrivs letar den upp det
 * väntande växelsamtalet i stället för tvärtom.
 */

import { db } from "@/lib/db";

const PROVIDER = "lynes";

/**
 * Fönstret mäts från växelsamtalets SLUT, inte dess start.
 *
 * Det är skillnaden mellan en matchning som håller och en som ser ut att göra
 * det. Ett samtal i produktionsdatan är 2 033 sekunder långt — mäts avståndet
 * från starten hamnar dispositionen en halvtimme bort och faller utanför varje
 * rimligt fönster, trots att den skrevs direkt efter att luren lades på.
 *
 * Fördelningen från samtalets slut till dispositionen:
 *
 *     0–30 s efter      313
 *     30–120 s efter     41
 *     före slutet        18
 *     2–10 min efter     15
 *
 * Två minuter efter täcker 354 av dem. De 15 som ligger längre bort lämnas
 * omatchade med flit: där hann säljaren ringa ett samtal till, och en gissning
 * som sätter fel samtalslängd på fel utfall förgiftar precis den statistik
 * kopplingen finns till för.
 *
 * Före-fönstret finns för att växelns `endedAt` är HÄRLEDD (`startTime +
 * duration`, Lynes skickar ingen sluttid). Är durationen någon sekund för lång
 * ligger dispositionen strax före det beräknade slutet.
 */
const LINK_BEFORE_MS = 90 * 1000;
const LINK_AFTER_MS = 2 * 60 * 1000;

export type PendingCallMatch = {
  callId: string;
  providerCallId: string;
  durationSec: number | null;
  recordingUrl: string | null;
};

/**
 * Letar upp växelsamtalet som hör till en nyss skriven registrering.
 *
 * Villkoren är desamma som i `ingest.ts`, av samma skäl: utan säljarkravet
 * stjäl en kollegas samtal kopplingen, utan nummer- eller leadkravet hamnar
 * samtalslängden på fel bolag, och utan "saknar koppling" skrivs en redan
 * korrekt koppling över.
 *
 * Riktningen kräver ett villkor till: bara UTGÅENDE samtal. Ringer en kund
 * tillbaka mitt i ett ringpass ligger det inkommande samtalet inom fönstret
 * och skulle annars kunna kapa dispositionen för det utgående.
 */
export async function findPendingCall(params: {
  sellerId: string;
  leadId: string;
  dialedE164: string | null;
  at: Date;
}): Promise<PendingCallMatch | null> {
  const { sellerId, leadId, dialedE164, at } = params;

  const candidates = await db.telephonyCall.findMany({
    where: {
      provider: PROVIDER,
      userId: sellerId,
      callAttemptId: null,
      // Inkommande samtal hör aldrig till en disposition säljaren själv ringde.
      // NULL släpps igenom: riktningen är okänd på gamla rader, och att kasta
      // dem hade gjort backfillen sämre än den behöver vara.
      direction: { not: "INBOUND" },
      endedAt: {
        gte: new Date(at.getTime() - LINK_AFTER_MS),
        lte: new Date(at.getTime() + LINK_BEFORE_MS),
      },
      ...(dialedE164
        ? { OR: [{ leadId }, { otherPartyE164: dialedE164 }] }
        : { leadId }),
    },
    select: {
      id: true,
      providerCallId: true,
      endedAt: true,
      durationSec: true,
      recordingUrl: true,
    },
  });

  if (candidates.length === 0) return null;

  // Närmast i tid vinner. Sorteringen kan inte göras i databasen — SQLite har
  // ingen ordning på absolut differens mot ett värde vi bär med oss — och
  // kandidaterna är per definition en handfull inom fyra minuter.
  const best = candidates.reduce((a, b) => {
    const da = Math.abs((a.endedAt?.getTime() ?? 0) - at.getTime());
    const db_ = Math.abs((b.endedAt?.getTime() ?? 0) - at.getTime());
    return db_ < da ? b : a;
  });

  return {
    callId: best.id,
    providerCallId: best.providerCallId,
    durationSec: best.durationSec,
    recordingUrl: best.recordingUrl,
  };
}

/**
 * Knyter ihop de två raderna och fyller i det växeln vet och säljaren inte kan
 * veta.
 *
 * Bara TOMMA fält fylls, precis som åt andra hållet. Säljarens registrering är
 * sanningen om vad som hände i samtalet; växeln vet bara hur det gick tekniskt
 * och får aldrig skriva över en siffra en människa satt.
 *
 * Kastar aldrig. En koppling som fallerar får inte fälla dispositionen — då
 * vore botemedlet värre än sjukdomen: säljaren förlorar samtalet helt i stället
 * för att förlora en samtalslängd som går att räkna ut i efterhand ur samma
 * rader.
 */
export async function linkAttemptToCall(params: {
  attemptId: string;
  attemptDurationSec: number;
  match: PendingCallMatch;
}): Promise<boolean> {
  const { attemptId, attemptDurationSec, match } = params;

  try {
    const attemptData: Record<string, unknown> = {
      providerCallId: match.providerCallId,
    };

    // durationSec har DEFAULT 0, så noll betyder "aldrig satt".
    //
    // Cockpitens egen mätning är i praktiken alltid noll eller nära noll — den
    // mäter tiden dispositionsrutan var öppen, inte samtalet. I produktion står
    // det 3 sekunder i snitt på en bokad återkomst, vilket är omöjligt. Växelns
    // längd är den enda riktiga siffran vi har.
    if (!attemptDurationSec && match.durationSec) {
      attemptData.durationSec = match.durationSec;
    }
    if (match.recordingUrl) attemptData.recordingUrl = match.recordingUrl;

    await db.$transaction([
      db.callAttempt.update({ where: { id: attemptId }, data: attemptData }),
      db.telephonyCall.update({
        where: { id: match.callId },
        data: { callAttemptId: attemptId },
      }),
    ]);
    return true;
  } catch {
    // Den realistiska krocken är unikhetskravet på `CallAttempt.providerCallId`:
    // webhooken hann koppla samma samtal medan dispositionen skrevs. Kopplingen
    // finns då redan och det är inget fel.
    return false;
  }
}
