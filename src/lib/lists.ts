import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { claimCutoff } from "@/lib/claim";

// Ren claim-logik bor i @/lib/claim (inga DB-beroenden — funkar i klienten).
// Återexporteras här så server-koden bara behöver en import.
export {
  CLAIM_TTL_DAYS,
  claimCutoff,
  claimExpiry,
  claimState,
  isLeadFree,
  type ClaimState,
} from "@/lib/claim";

export type SessionUser = { id: string; role: string };

export function isAdminUser(user: SessionUser): boolean {
  return user.role === "ADMIN";
}

/**
 * Prisma-filter för leads som är LEDIGA att claima:
 * aldrig låsta, eller lås som löpt ut.
 */
export function freeLeadWhere(now: Date = new Date()): Prisma.LeadWhereInput {
  return {
    OR: [{ claimedAt: null }, { claimedAt: { lt: claimCutoff(now) } }],
  };
}

/**
 * Prisma-filter för leads som är låsta av en specifik användare och
 * fortfarande innanför låsets giltighetstid.
 */
export function claimedByWhere(userId: string, now: Date = new Date()): Prisma.LeadWhereInput {
  return { ownerId: userId, claimedAt: { gte: claimCutoff(now) } };
}

/** Alla list-id:n användaren får se. Admin ser allt. */
export async function accessibleListIds(user: SessionUser): Promise<string[]> {
  if (isAdminUser(user)) {
    const lists = await db.callList.findMany({ select: { id: true } });
    return lists.map((l) => l.id);
  }
  const rows = await db.listAccess.findMany({
    where: { userId: user.id },
    select: { listId: true },
  });
  return rows.map((r) => r.listId);
}

/** Har användaren tillgång till mappen? */
export async function canAccessList(user: SessionUser, listId: string): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const row = await db.listAccess.findUnique({
    where: { listId_userId: { listId, userId: user.id } },
    select: { listId: true },
  });
  return row !== null;
}

/**
 * Synlighetsfilter för leads: allt du äger + allt som ligger i en mapp du
 * har tillgång till. Admin får inget filter alls.
 */
export function visibleLeadWhere(user: SessionUser): Prisma.LeadWhereInput {
  if (isAdminUser(user)) return {};
  return {
    OR: [
      { ownerId: user.id },
      { lists: { some: { list: { access: { some: { userId: user.id } } } } } },
    ],
  };
}

/** Får användaren öppna/jobba med det här leadet? */
export async function canAccessLead(user: SessionUser, leadId: string): Promise<boolean> {
  if (isAdminUser(user)) return true;
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...visibleLeadWhere(user) },
    select: { id: true },
  });
  return lead !== null;
}
