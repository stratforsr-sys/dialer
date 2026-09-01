"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/lists";
import { ForbiddenError } from "@/lib/guard";
import {
  rotationResumeAt,
  toSchedulerConfig,
  noRestDays,
  alignToSlot,
  pickNextSlot,
  type Slot,
} from "@/lib/scheduler";
import { blockLead } from "@/lib/donotcall";
import type { CallbackCancelReason, NoReason } from "@/generated/prisma/client";

/**
 * Återkomster — läsning och rättelser.
 *
 * Bokningen sker inte här. Den sker i `recordAttempt`, i samma transaktion som
 * samtalet skrivs, eftersom en återkomst utan sitt samtal är en rad som ljuger
 * om varför den finns. Här ligger allt EFTER bokningen: klockan i sidebaren,
 * chefsvyn, och de tre rättelser en säljare behöver kunna göra utan att ringa
 * om — flytta fram, avboka, och slå på eller av mejlpåminnelsen.
 *
 * `Lead.callbackAt` och `Lead.nextActionAt` skrivs om vid varje rättelse.
 * De två kolumnerna är vad lease-frågan sorterar på, och en återkomst som
 * flyttats i klockan men inte på leadet hade serverats på den gamla tiden.
 */

/**
 * Varken golv eller tak.
 *
 * Här låg först en gräns nedåt på 30 dagar: äldre än så föll ur klockan. Den
 * togs bort — den lät ett löfte försvinna av sig självt, precis som buggen i
 * dispositionen. En återkomst lämnar klockan på två sätt: den ringdes, eller
 * den avbokades. Ingen tredje väg, och tiden är ingen av dem.
 *
 * Kvar stod ett tak: `scheduledAt <= nu + 7 dagar`. Samma fel, andra hållet,
 * och det bet 2026-09-01. Chefsvyn ("golvets återkomster") delar den här
 * frågan med klockan, och taket gjorde den ofullständig: **50 av 251 öppna
 * återkomster gick inte att se någonstans i systemet** eftersom de låg mer än
 * en vecka fram. En chef som söker efter ett bolag i den vyn och inte hittar
 * det drar slutsatsen att löftet inte finns — vilket var precis vad som
 * rapporterades.
 *
 * Taket ligger nu i klockorna i stället, där det hör hemma. Cockpitens klocka
 * filtrerade redan lokalt på "dags inom fem minuter" och påverkas inte alls;
 * sidomenyns klocka räknar bara missade och aktuella i sin siffra, så en
 * längre "Kommande"-lista gör den inte högljuddare. Vyerna får välja vad de
 * visar. Frågan ska svara sant.
 *
 * `MAX_ROWS` höjt från 200: med taket borta är 200 en tyst avhuggning av
 * `ORDER BY scheduledAt ASC`, alltså av de löften som ligger längst fram —
 * exakt de som taket redan dolde. 251 öppna idag.
 */
const MAX_ROWS = 500;

export interface CallbackRow {
  id: string;
  scheduledAt: Date;
  note: string | null;
  emailReminder: boolean;
  seen: boolean;
  leadId: string;
  companyName: string;
  /** Kontakten löftet gavs till. Behövs för att skriva samtalet och för att
   *  förifylla affärsrutan — dispositionen sker numera i klockan. */
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  /** Bästa numret att ringa: direktnummer före växel, E.164 före fritext. */
  phone: string | null;
  sellerId: string;
  sellerName: string;
}

function rowsFrom(
  rows: Array<{
    id: string;
    scheduledAt: Date;
    note: string | null;
    emailReminder: boolean;
    seenAt: Date | null;
    leadId: string;
    sellerId: string;
    lead: { companyName: string };
    seller: { name: string };
    contact: {
      id: string;
      name: string;
      email: string | null;
      directPhoneE164: string | null;
      directPhone: string | null;
      switchboardE164: string | null;
      switchboard: string | null;
    } | null;
  }>
): CallbackRow[] {
  return rows.map((c) => ({
    id: c.id,
    scheduledAt: c.scheduledAt,
    note: c.note,
    emailReminder: c.emailReminder,
    seen: c.seenAt !== null,
    leadId: c.leadId,
    companyName: c.lead.companyName,
    contactId: c.contact?.id ?? null,
    contactName: c.contact?.name ?? null,
    contactEmail: c.contact?.email ?? null,
    phone:
      c.contact?.directPhoneE164 ??
      c.contact?.directPhone ??
      c.contact?.switchboardE164 ??
      c.contact?.switchboard ??
      null,
    sellerId: c.sellerId,
    sellerName: c.seller.name,
  }));
}

const ROW_SELECT = {
  id: true,
  scheduledAt: true,
  note: true,
  emailReminder: true,
  seenAt: true,
  leadId: true,
  sellerId: true,
  lead: { select: { companyName: true } },
  seller: { select: { name: true } },
  contact: {
    select: {
      id: true,
      name: true,
      email: true,
      directPhoneE164: true,
      directPhone: true,
      switchboardE164: true,
      switchboard: true,
    },
  },
} as const;

/**
 * Klockans data: öppna återkomster, missade först i tiden.
 *
 * `scope: "floor"` ger hela golvet och kräver admin. Säljare får aldrig se
 * någon annans — inte för att det är hemligt, utan för att en klocka som
 * räknar 40 när fyra är mina slutar betyda något.
 */
export async function listCallbacks(
  scope: "mine" | "floor" = "mine"
): Promise<{ rows: CallbackRow[]; scope: "mine" | "floor"; isAdmin: boolean }> {
  const user = await requireAuth();
  const admin = isAdminUser(user);
  const effective: "mine" | "floor" = scope === "floor" && admin ? "floor" : "mine";

  const rows = await db.callback.findMany({
    where: {
      status: "PENDING",
      // Varken golv eller tak — se MAX_ROWS. Allt som är öppet ligger kvar,
      // hur långt fram eller hur långt tillbaka det än ligger.
      ...(effective === "mine" ? { sellerId: user.id } : {}),
    },
    select: ROW_SELECT,
    orderBy: { scheduledAt: "asc" },
    take: MAX_ROWS,
  });

  return { rows: rowsFrom(rows), scope: effective, isAdmin: admin };
}

/** Grind: egna återkomster, eller vad som helst om man är admin. */
async function requireCallbackAccess(id: string) {
  const user = await requireAuth();
  const cb = await db.callback.findUnique({
    where: { id },
    select: { id: true, sellerId: true, leadId: true, status: true, scheduledAt: true },
  });
  if (!cb) throw new ForbiddenError(`callback ${id}`);
  if (!isAdminUser(user) && cb.sellerId !== user.id) {
    throw new ForbiddenError(`callback ${id}`);
  }
  return { user, cb };
}

/**
 * Speglar den öppna återkomsten till leadets schemaläggningskolumner.
 *
 * Finns flera öppna på samma lead vinner den tidigaste — det är den som ska
 * serveras härnäst.
 *
 * ## Finns ingen kvar: tillbaka till rotationen, inte till toppen av kön
 *
 * Fram till 2026-08-26 stod här `nextActionAt: next?.scheduledAt ?? null` med
 * kommentaren "alltså ringbart direkt". Det var fel, och det var den enskilt
 * största orsaken till att bolag dök upp igen direkt efter att de ringts:
 *
 *   - `nextActionAt IS NULL` passerar däckets tidsvillkor rakt igenom, så
 *     bolaget blir ringbart i samma sekund som återkomsten avbokas.
 *   - `ORDER BY l."nextActionAt" ASC` sorterar NULL **först** i SQLite. Bolaget
 *     hamnade alltså inte bara tillbaka i kön utan allra överst i den, före
 *     varje bolag som faktiskt väntat ut sin vila.
 *
 * Ett avbokat löfte betyder att löftet är borta — inte att bolaget aldrig
 * ringts. Vilan det tjänade ihop på sitt senaste samtal gäller fortfarande, och
 * `rotationResumeAt` räknar fram den ur `lastAttemptAt` + `lastResult`. Ett
 * lead som aldrig ringts får `null`, vilket är rätt: det är obearbetat, inte
 * vilande.
 *
 * Mätt i produktionen 2026-08-26: 74 leads låg med `nextActionAt = NULL` och
 * `retired = 0`, och **alla 74** hade en avbokad återkomst bakom sig.
 *
 * ## Låset följer med löftet
 *
 * `claimedAt` sätts av `CALLBACK_BOOKED` för att en kollega inte ska bränna ett
 * personligt löfte. Försvinner löftet finns ingen relation kvar att skydda, och
 * då ska låset inte ligga kvar och hålla bolaget osynligt för alla andra i 60
 * dagar. Samma regel som `claimsLead` i scheduler.ts, tillämpad åt andra hållet.
 * Flyttas återkomsten i stället för att avbokas finns en PENDING-rad kvar och
 * låset står orört.
 */
async function syncLeadFromCallbacks(leadId: string) {
  const next = await db.callback.findFirst({
    where: { leadId, status: "PENDING" },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });

  if (next) {
    await db.lead.update({
      where: { id: leadId },
      data: { callbackAt: next.scheduledAt, nextActionAt: next.scheduledAt },
    });
    return;
  }

  const [lead, cfg, slots] = await Promise.all([
    db.lead.findUnique({
      where: { id: leadId },
      select: {
        lastAttemptAt: true,
        lastResult: true,
        lastOutcome: true,
        lastNoReason: true,
      },
    }),
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
    db.callSlot.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  const resumeAt =
    lead && cfg
      ? rotationResumeAt({
          lastAttemptAt: lead.lastAttemptAt,
          lastResult: lead.lastResult,
          // Utan de här två föll ett nej tillbaka på 20 timmar så fort någon
          // avbokade en återkomst som bokats EFTER nejet — samma väg som
          // 2026-08-26 redan en gång lyfte bolag tillbaka i förtid.
          lastOutcome: lead.lastOutcome,
          lastNoReason: lead.lastNoReason,
          slots: slots as Slot[],
          config: toSchedulerConfig(cfg),
        })
      : null;

  await db.lead.update({
    where: { id: leadId },
    data: { callbackAt: null, nextActionAt: resumeAt, claimedAt: null },
  });
}

/** Flytta fram. `scheduledAt` är en ISO-sträng från klienten. */
export async function rescheduleCallback(id: string, scheduledAt: string) {
  const { cb } = await requireCallbackAccess(id);

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw new Error("Ogiltig tidpunkt");

  await db.callback.update({
    where: { id },
    data: {
      scheduledAt: when,
      status: "PENDING",
      seenAt: null,
      // Ny tid, nytt mejl. Utan nollställningen skickas påminnelsen aldrig för
      // en återkomst som flyttats från igår till imorgon.
      emailSentAt: null,
      completedAt: null,
      cancelledAt: null,
    },
  });

  await syncLeadFromCallbacks(cb.leadId);
  return { ok: true, scheduledAt: when };
}

/** Skjut upp N minuter från NU, inte från den ursprungliga tiden. */
export async function snoozeCallback(id: string, minutes: number) {
  const safe = Math.min(Math.max(Math.trunc(minutes), 1), 60 * 24 * 30);
  return rescheduleCallback(id, new Date(Date.now() + safe * 60_000).toISOString());
}

export interface CancelCallbackInput {
  reason: CallbackCancelReason;
  /** Obligatorisk när `reason` är `SA_NEJ`. */
  noReason?: NoReason | null;
  /** Fritext, syns i aktivitetsloggen på bolaget. */
  note?: string | null;
}

/**
 * Släpp löftet — med ett utfall.
 *
 * ## Varför knappen inte längre är ett klick
 *
 * `Avboka` gjorde tidigare två saker: satte raden till CANCELLED och lät
 * `syncLeadFromCallbacks` lägga tillbaka bolaget i rotationen på den vila det
 * redan hade tjänat ihop. På ett bolag vars senaste samtal var `CONNECTED_DM`
 * — alltså varje bolag där någon bokat en återkomst — betyder det
 * `retryHoursNoAnswer`, **tjugo timmar**.
 *
 * Sa kunden "nej tack, sluta ringa" när säljaren följde upp löftet, och
 * säljaren avbokade i stället för att registrera samtalet, låg bolaget alltså
 * tillbaka i hela golvets däck dagen efter. Beskedet från kunden fanns i
 * huvudet på en säljare och ingenstans i datan. Det är samma slutresultat som
 * felet migration 024 lagade, via en annan knapp.
 *
 * En avbokning är ett **beslut om bolaget**, inte en städning av en lista.
 * Skälet är därför obligatoriskt, och det styr vad som händer med leadet:
 * exakt samma tillstånd som motsvarande utfall i dispositionen ger. Annars är
 * avbokningen en andra, tystare väg förbi rotationens regler.
 *
 * | Skäl | Leadet |
 * |---|---|
 * | `SA_NEJ` | Vilar `noRestDays` (60 dagar), `lastOutcome = DM_NO` |
 * | `BORTFALL` | Pensionerat **och** spärrlistat på org-numret |
 * | `FEL_NUMMER` | Pensionerat, som `WRONG_NUMBER` |
 * | `FELBOKAD` | Tillbaka i rotationen — det gamla beteendet |
 *
 * ## Inget samtal skrivs
 *
 * Ingen `CallAttempt`, med flit. Den tabellen är statistikens nämnare: en
 * avbokning som blev ett samtal hade sänkt svarsfrekvensen, höjt dagsmålet och
 * räknats i coachningen, för ett samtal som aldrig ringdes. Samma skäl som
 * "Inget telefonnummer" ligger utanför `CallResult`. Spåret för en människa
 * skrivs i stället i `Activity`, där lead-sidan läser det.
 *
 * ## `FELBOKAD` finns för att den måste finnas
 *
 * Ett skäl som betyder "inget besked om bolaget" måste vara ett av
 * alternativen. Utan en ärlig utväg väljer säljaren ett falskt skäl för att
 * komma vidare, och då är en obligatorisk fråga värre än ingen fråga alls:
 * datan ser fullständig ut och är fel.
 */
export async function cancelCallback(id: string, input: CancelCallbackInput) {
  const { user, cb } = await requireCallbackAccess(id);

  const reason = input.reason;
  // Ett nej utan anledning går inte att räkna på, och `noRestDays` behöver den
  // för att veta om "vill inte prata med säljare" ska förlänga vilan.
  const noReason = reason === "SA_NEJ" ? input.noReason ?? null : null;
  if (reason === "SA_NEJ" && !noReason) {
    throw new Error("Välj varför kunden sa nej");
  }

  const now = new Date();
  const note = input.note?.trim() || null;

  await db.callback.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: reason,
      cancelNoReason: noReason,
      cancelledById: user.id,
    },
  });

  // Terminalt: bolaget är ur spel, och då stängs allas löften på det — samma
  // regel som `terminalReason` i dispositionen. En rad som låg kvar hade
  // skickat en kollega till en stängd dörr.
  const terminal = reason === "BORTFALL" || reason === "FEL_NUMMER";
  if (terminal) {
    await db.callback.updateMany({
      where: { leadId: cb.leadId, status: "PENDING" },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason,
        cancelledById: user.id,
      },
    });

    // Spärren FÖRE pensioneringen, samma ordning som "Inget telefonnummer":
    // `blockLead` läser org-numret ur leadet, och den nyckeln är den enda som
    // överlever en omimport.
    if (reason === "BORTFALL") {
      await blockLead({
        leadId: cb.leadId,
        userId: user.id,
        reason: note || "Bortfall — bolaget vill inte bli kontaktat",
      });
    }

    await db.lead.update({
      where: { id: cb.leadId },
      data: {
        retired: true,
        retiredReason: reason === "BORTFALL" ? "bortfall" : "fel_nummer",
        callbackAt: null,
        nextActionAt: null,
        claimedAt: null,
      },
    });
    await logCancellation(cb.leadId, user.id, reason, noReason, note);
    return { ok: true };
  }

  if (reason === "SA_NEJ") {
    // Finns ett annat löfte kvar på bolaget vinner det. Ett lovat samtal
    // rankar över vilan — samma prioritering som migration 022 höll när nej-
    // vilan backfillades och de fyra med öppen återkomst lämnades orörda.
    const remaining = await db.callback.findFirst({
      where: { leadId: cb.leadId, status: "PENDING" },
      select: { id: true },
    });

    if (!remaining) {
      const [cfg, slots] = await Promise.all([
        db.dialerConfig.findUnique({ where: { id: "singleton" } }),
        db.callSlot.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
      ]);

      // Saknas konfigurationen går vilan inte att räkna, och då skrivs den
      // inte. `nextActionAt = NULL` betyder "aldrig ringt", inte "vilar" —
      // och `ORDER BY nextActionAt ASC` sorterar NULL FÖRST i SQLite, så ett
      // nej hade landat allra överst i hela golvets däck. Det är exakt felet
      // `syncLeadFromCallbacks` gjorde fram till 2026-08-26. Hellre den gamla,
      // kortare vilan än ett bolag i toppen av kön.
      const config = cfg ? toSchedulerConfig(cfg) : null;
      if (!config) {
        await db.lead.update({
          where: { id: cb.leadId },
          data: { lastOutcome: "DM_NO", lastNoReason: noReason },
        });
        await syncLeadFromCallbacks(cb.leadId);
        await logCancellation(cb.leadId, user.id, reason, noReason, note);
        return { ok: true };
      }

      // Vilan räknas från NU, inte från `lastAttemptAt`. Nejet är ny
      // information i det här ögonblicket — det kom inte i samtalet som bokade
      // återkomsten, för då hade det registrerats där. Att räkna från det
      // gamla samtalet hade gett en kortare vila ju längre löftet legat.
      const rest = new Date(now);
      rest.setDate(rest.getDate() + noRestDays(noReason, config));
      const slot = pickNextSlot(slots as Slot[], [], rest);
      const nextActionAt = alignToSlot(rest, slot, config.blockedDates);

      await db.lead.update({
        where: { id: cb.leadId },
        data: {
          callbackAt: null,
          nextActionAt,
          // Låset skyddar en relation, och ett nej är ingen relation.
          claimedAt: null,
          // Speglas hit av samma skäl som dispositionen speglar dem: däcket och
          // mappvyn ska kunna säga "Sa nej" i stället för "Vilar", och
          // `rotationResumeAt` ska kunna räkna om vilan utan att gå till
          // CallAttempt-historiken. Utan raden nedan hade nästa avbokning på
          // bolaget lagt det tillbaka på tjugo timmar.
          lastOutcome: "DM_NO",
          lastNoReason: noReason,
        },
      });
      await logCancellation(cb.leadId, user.id, reason, noReason, note);
      return { ok: true };
    }
  }

  // FELBOKAD, och SA_NEJ med ett annat löfte kvar: det gamla beteendet.
  await syncLeadFromCallbacks(cb.leadId);
  await logCancellation(cb.leadId, user.id, reason, noReason, note);
  return { ok: true };
}

/** Etiketterna som står i aktivitetsloggen. Samma ord som knapparna. */
const CANCEL_LABELS: Record<CallbackCancelReason, string> = {
  SA_NEJ: "Kunden sa nej",
  BORTFALL: "Vill inte bli kontaktad",
  FEL_NUMMER: "Fel nummer",
  FELBOKAD: "Felbokad återkomst",
};

const NO_REASON_LABELS: Record<NoReason, string> = {
  PRIS: "Pris",
  TIMING: "Timing",
  HAR_BYRA: "Har byrå",
  HAR_INHOUSE: "Har inhouse",
  INGET_BEHOV: "Inget behov",
  NOJD_MED_ANNAN: "Nöjd med annan",
  NEJ_INNAN_PITCH: "Sa nej innan pitch",
  VILL_EJ_PRATA_SALJARE: "Vill inte prata med säljare",
};

/**
 * Spåret en människa kan läsa.
 *
 * Lead-sidan renderar `Activity`, inte `Callback`. Utan den här raden var en
 * släppt återkomst osynlig där: bolaget bytte bara tillstånd, och nästa
 * säljare som öppnade det såg en vila utan att kunna se varför den fanns.
 *
 * Kastar aldrig. En logg som fallerar får inte fälla ett beslut som redan är
 * skrivet — leadet är i så fall redan i rätt tillstånd, och det är det som
 * skyddar kunden.
 */
async function logCancellation(
  leadId: string,
  userId: string,
  reason: CallbackCancelReason,
  noReason: NoReason | null,
  note: string | null
) {
  const label = noReason
    ? `${CANCEL_LABELS[reason]} — ${NO_REASON_LABELS[noReason]}`
    : CANCEL_LABELS[reason];
  try {
    await db.activity.create({
      data: {
        type: "STATUS_CHANGE",
        leadId,
        actorId: userId,
        // Samma form som CALL-raderna redan har — { status, notes } — så att
        // LeadDetail och LeadHistory renderar den utan att veta att den finns.
        // Svenska etiketter av samma skäl: loggen läses av människor.
        metadata: JSON.stringify({
          status: `Återkomst släppt: ${label}`,
          notes: note,
        }),
      },
    });
  } catch {
    // Se doc-kommentaren.
  }
}

/** Slå på eller av mejlpåminnelsen i efterhand. */
export async function setCallbackEmailReminder(id: string, enabled: boolean) {
  await requireCallbackAccess(id);
  await db.callback.update({
    where: { id },
    data: {
      emailReminder: enabled,
      // Slås den på igen ska morgonmejlet kunna ta med raden även om den redan
      // varit påslagen en gång tidigare.
      ...(enabled ? { emailSentAt: null } : {}),
    },
  });
  return { ok: true };
}

/**
 * Kvittera notisen. Tar bort prickräkningen utan att röra löftet — säljaren
 * har sett den, inte ringt den.
 */
export async function markCallbacksSeen(ids: string[]) {
  const user = await requireAuth();
  if (ids.length === 0) return { seen: 0 };

  const res = await db.callback.updateMany({
    where: {
      id: { in: ids.slice(0, MAX_ROWS) },
      status: "PENDING",
      seenAt: null,
      ...(isAdminUser(user) ? {} : { sellerId: user.id }),
    },
    data: { seenAt: new Date() },
  });
  return { seen: res.count };
}
