"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/lists";
import { ForbiddenError } from "@/lib/guard";

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
/** Missade äldre än så här slutar skrika. De ligger kvar, men larmar inte. */
const OVERDUE_LIMIT_DAYS = 30;
const MAX_ROWS = 60;

export interface CallbackRow {
  id: string;
  scheduledAt: Date;
  note: string | null;
  emailReminder: boolean;
  seen: boolean;
  leadId: string;
  companyName: string;
  contactName: string | null;
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
      name: string;
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
    contactName: c.contact?.name ?? null,
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
      name: true,
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
  const floorDate = new Date(now.getTime() - OVERDUE_LIMIT_DAYS * 86_400_000);

  const rows = await db.callback.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { gte: floorDate, lte: horizon },
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
 * serveras härnäst. Finns ingen alls går leadet tillbaka i rotationen med
 * `nextActionAt = null`, alltså ringbart direkt.
 */
async function syncLeadFromCallbacks(leadId: string) {
  const next = await db.callback.findFirst({
    where: { leadId, status: "PENDING" },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });

  await db.lead.update({
    where: { id: leadId },
    data: {
      callbackAt: next?.scheduledAt ?? null,
      nextActionAt: next?.scheduledAt ?? null,
    },
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
