"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { startOfDay, hourOfDay } from "@/lib/time";

/**
 * Coachingunderlag ur VÄXELNS samtal, inte ur säljarens registrering.
 *
 * Det är hela poängen med att läsa härifrån. `CallAttempt.durationSec` mäter
 * tiden dispositionsrutan var öppen, inte samtalet — i produktionsdata står
 * det 3 sekunder på en bokad återkomst och 5 på ett DM-nej, vilket är omöjligt.
 * Växeln vet den riktiga längden: 89 respektive 108 sekunder. Ingen av
 * frågorna nedan gick att ställa innan samtal och disposition kopplades ihop.
 *
 * Behörigheten följer samma regel som statistiken: en SÄLJARE ser bara sina
 * egna rader, alltid, oavsett vad klienten skickar.
 */

/**
 * Ringtiden ingår i `durationSec`. Lynes skickar en enda längd och ingen
 * svarstidpunkt, så uppkopplad tid går inte att skilja ut.
 *
 * Storleken går däremot att mäta: ett obesvarat samtal är REN ringtid, och
 * medianen för dem ligger på 23 sekunder i produktionsdatan. Den räknas om vid
 * varje anrop i stället för att hårdkodas — ändrar växeln sin timeout följer
 * måttet med, och en felaktig konstant hade tyst förskjutit varje längd i hela
 * vyn.
 */
const RING_FALLBACK_SEC = 23;

/**
 * Ett samtal som dör inom en halvminut efter att någon svarat kom aldrig förbi
 * öppningen. Tröskeln mäts på uppkopplad tid, alltså EFTER att ringtiden
 * dragits bort — annars hade en säljare med lång ringtid sett ut att ha korta
 * samtal.
 */
const SHORT_CALL_SEC = 30;

/**
 * Luckor längre än så är rast, möte eller lunch — inte dödtid mellan samtal.
 * Räknas de med mäter måttet arbetsdagens form i stället för säljarens tempo,
 * och en säljare som tog en lång lunch hamnar överst bland de långsamma.
 */
const MAX_GAP_SEC = 20 * 60;

/** Under så här många samtal är medianer och andelar brus, inte signal. */
const MIN_CALLS_FOR_FLAGS = 15;

export type CoachingSeller = {
  id: string;
  name: string;
  calls: number;
  connected: number;
  talkMinutes: number;
  /** Uppkopplad tid i sekunder, median. Ringtiden bortdragen. */
  medianTalkSec: number;
  /** Andel av de uppkopplade samtalen som dog inom SHORT_CALL_SEC. */
  shortShare: number;
  /** Median i sekunder mellan att ett samtal la på och nästa ringde upp. */
  medianGapSec: number;
  /** Taltid i minuter per timme på dagen, 6–19. Index 0 = klockan 06. */
  byHour: number[];
  /** Det som avviker mot golvet, i klartext. Tom lista = inget att säga. */
  flags: string[];
};

export type CoachingBoard = {
  days: number;
  ringOverheadSec: number;
  /** Medianer för hela golvet — referensen varje säljare jämförs mot. */
  team: { shortShare: number; medianGapSec: number; medianTalkSec: number };
  sellers: CoachingSeller[];
  /** Samtal utan disposition. Växeln såg dem, systemet vet inget om dem. */
  unregistered: number;
  totalCalls: number;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export async function getCoachingBoard(days = 7): Promise<CoachingBoard> {
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";
  const since = startOfDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  const calls = await db.telephonyCall.findMany({
    where: {
      startedAt: { gte: since },
      // Inkommande samtal säger inget om hur säljaren ringer.
      direction: { not: "INBOUND" },
      // En säljare ser bara sina egna. Filtret ligger i frågan och inte i
      // efterbehandlingen, så att en ny kolumn i selecten inte kan läcka.
      userId: isAdmin ? { not: null } : user.id,
    },
    select: {
      userId: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      callAttemptId: true,
      callAttempt: { select: { result: true } },
    },
    orderBy: { startedAt: "asc" },
  });

  // Ringtiden mäts på de obesvarade: de består av ingenting annat.
  const ringSamples = calls
    .filter((c) => c.callAttempt?.result === "NO_ANSWER" && (c.durationSec ?? 0) > 0)
    .map((c) => c.durationSec as number);
  const ringOverheadSec = ringSamples.length >= 10 ? median(ringSamples) : RING_FALLBACK_SEC;

  const userIds = Array.from(
    new Set(calls.map((c) => c.userId).filter((x): x is string => !!x))
  );
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name || u.email]));

  type Row = (typeof calls)[number];
  const perSeller: Record<string, Row[]> = {};
  for (const c of calls) {
    if (!c.userId) continue;
    (perSeller[c.userId] ??= []).push(c);
  }

  const sellers: CoachingSeller[] = [];

  for (const [id, own] of Object.entries(perSeller)) {
    // Uppkopplat = växeln registrerade en längd över ringtiden. Definitionen
    // står och faller med att `duration: 0` betyder obesvarat, vilket är
    // verifierat mot 471 samtal.
    const connected = own.filter((c) => (c.durationSec ?? 0) > ringOverheadSec);
    const talkSecs = connected.map((c) => (c.durationSec as number) - ringOverheadSec);

    // Luckorna: från ett samtals slut till nästa samtals början, inom samma
    // dag. Sorteringen är redan gjord i frågan.
    const gaps: number[] = [];
    for (let i = 1; i < own.length; i++) {
      const prevEnd = own[i - 1].endedAt?.getTime();
      const nextStart = own[i].startedAt?.getTime();
      if (!prevEnd || !nextStart) continue;
      const gap = Math.round((nextStart - prevEnd) / 1000);
      if (gap < 0 || gap > MAX_GAP_SEC) continue;
      gaps.push(gap);
    }

    const byHour = Array(14).fill(0) as number[];
    for (const c of connected) {
      if (!c.startedAt) continue;
      // Svensk väggklocka, inte serverns. Vercel kör UTC.
      const h = hourOfDay(c.startedAt);
      if (h < 6 || h > 19) continue;
      byHour[h - 6] += ((c.durationSec as number) - ringOverheadSec) / 60;
    }

    sellers.push({
      id,
      name: nameOf.get(id) ?? "Okänd",
      calls: own.length,
      connected: connected.length,
      talkMinutes: Math.round(talkSecs.reduce((a, b) => a + b, 0) / 60),
      medianTalkSec: median(talkSecs),
      shortShare: connected.length
        ? talkSecs.filter((s) => s < SHORT_CALL_SEC).length / connected.length
        : 0,
      medianGapSec: median(gaps),
      byHour: byHour.map((m) => Math.round(m)),
      flags: [],
    });
  }

  // Golvets medianer är referensen. Ett absolut mål ("minst 90 sekunder") hade
  // varit en gissning; medianen är det som faktiskt går att nå, eftersom
  // hälften av golvet redan gör det.
  const rankable = sellers.filter((s) => s.calls >= MIN_CALLS_FOR_FLAGS);
  const team = {
    shortShare: rankable.length ? median(rankable.map((s) => Math.round(s.shortShare * 100))) / 100 : 0,
    medianGapSec: median(rankable.map((s) => s.medianGapSec)),
    medianTalkSec: median(rankable.map((s) => s.medianTalkSec)),
  };

  // Flaggorna sätts bara där avvikelsen är stor nog att bära ett samtal.
  // Marginalerna finns för att medianen alltid har någon under sig — utan dem
  // hade halva golvet flaggats varje dag och listan slutat betyda något.
  for (const s of sellers) {
    if (s.calls < MIN_CALLS_FOR_FLAGS) continue;

    if (s.shortShare > team.shortShare + 0.1 && s.shortShare > 0.25) {
      s.flags.push(
        `${Math.round(s.shortShare * 100)} % av samtalen dör inom ${SHORT_CALL_SEC} sekunder — golvet ligger på ${Math.round(team.shortShare * 100)} %. Öppningen når inte fram.`
      );
    }
    if (team.medianGapSec > 0 && s.medianGapSec > team.medianGapSec * 1.5 && s.medianGapSec > 60) {
      s.flags.push(
        `${Math.round(s.medianGapSec / 60)} min och ${s.medianGapSec % 60} s mellan samtalen i median — golvet ligger på ${Math.floor(team.medianGapSec / 60)}:${String(team.medianGapSec % 60).padStart(2, "0")}.`
      );
    }
    if (team.medianTalkSec > 0 && s.medianTalkSec < team.medianTalkSec * 0.6 && s.connected >= 10) {
      s.flags.push(
        `Samtalen är ${s.medianTalkSec} s i median mot golvets ${team.medianTalkSec} s. Kommer sällan in i pitchen.`
      );
    }

    // Eftermiddagstappet: mer än två tredjedelar av taltiden före lunch.
    const before = s.byHour.slice(0, 6).reduce((a, b) => a + b, 0);
    const after = s.byHour.slice(6).reduce((a, b) => a + b, 0);
    if (before + after > 30 && after < (before + after) * 0.25) {
      s.flags.push(
        `${Math.round((after / (before + after)) * 100)} % av taltiden ligger efter klockan 12. Eftermiddagen används inte.`
      );
    }
  }

  // Den som behöver coachas mest först. Flest flaggor vinner; vid lika många
  // avgör andelen korta samtal, eftersom det är måttet som pekar på pitchen
  // och inte på tempot.
  sellers.sort((a, b) => b.flags.length - a.flags.length || b.shortShare - a.shortShare);

  return {
    days,
    ringOverheadSec,
    team,
    sellers,
    unregistered: calls.filter((c) => !c.callAttemptId).length,
    totalCalls: calls.length,
  };
}
