"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/lists";
import { ForbiddenError } from "@/lib/guard";
import { rotationResumeAt, toSchedulerConfig, type Slot } from "@/lib/scheduler";

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

/** Hur långt fram klockan tittar. Längre än så är inte en notis, det är en lista. */
const HORIZON_DAYS = 7;
/**
 * Missade har inget golv.
 *
 * Här låg tidigare en gräns på 30 dagar: äldre än så föll ur klockan. Den var
 * tänkt som ett skydd mot en lista som växer, men den gjorde samma sak som
 * buggen i dispositionen — den lät ett löfte försvinna av sig självt. En
 * återkomst lämnar klockan på två sätt: den ringdes, eller den avbokades.
 * Ingen tredje väg, och tiden är ingen av dem.
 */
const MAX_ROWS = 200;

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

  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const rows = await db.callback.findMany({
    where: {
      status: "PENDING",
      // Bara ett tak, inget golv. Allt som förfallit ligger kvar.
      scheduledAt: { lte: horizon },
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
      select: { lastAttemptAt: true, lastResult: true },
    }),
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
    db.callSlot.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  const resumeAt =
    lead && cfg
      ? rotationResumeAt({
          lastAttemptAt: lead.lastAttemptAt,
          lastResult: lead.lastResult,
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

/** Avboka. Leadet går tillbaka i den vanliga rotationen. */
export async function cancelCallback(id: string) {
  const { cb } = await requireCallbackAccess(id);

  await db.callback.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await syncLeadFromCallbacks(cb.leadId);
  return { ok: true };
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
