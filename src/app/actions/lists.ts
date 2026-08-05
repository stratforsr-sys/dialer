"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  accessibleListIds,
  canAccessList,
  claimCutoff,
  freeLeadWhere,
  isAdminUser,
  isLeadFree,
  visibleLeadWhere,
} from "@/lib/lists";

export type ListSummary = Awaited<ReturnType<typeof getLists>>[number];
export type ListDetail = NonNullable<Awaited<ReturnType<typeof getList>>>;

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Alla mappar användaren har tillgång till, med räknare för framsteg.
 * Framsteg = andel leads i mappen som någon har ringt.
 */
export async function getLists() {
  const user = await requireAuth();
  const ids = await accessibleListIds(user);

  const lists = await db.callList.findMany({
    where: { id: { in: ids }, archived: false },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      access: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { leads: true } },
    },
  });

  if (lists.length === 0) return [];

  const cutoff = claimCutoff();

  // Antal claimade (= påbörjade) leads per mapp, i en query
  const claimed = await db.leadOnList.groupBy({
    by: ["listId"],
    where: {
      listId: { in: lists.map((l) => l.id) },
      lead: { claimedAt: { not: null } },
    },
    _count: { leadId: true },
  });
  const claimedByList = new Map(claimed.map((c) => [c.listId, c._count.leadId]));

  // Antal lediga leads per mapp — det som faktiskt går att ringa just nu
  const free = await db.leadOnList.groupBy({
    by: ["listId"],
    where: {
      listId: { in: lists.map((l) => l.id) },
      lead: { OR: [{ claimedAt: null }, { claimedAt: { lt: cutoff } }] },
    },
    _count: { leadId: true },
  });
  const freeByList = new Map(free.map((f) => [f.listId, f._count.leadId]));

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    sourceFile: l.sourceFile,
    isSystem: l.isSystem,
    createdAt: l.createdAt,
    createdBy: l.createdBy,
    totalLeads: l._count.leads,
    workedLeads: claimedByList.get(l.id) ?? 0,
    freeLeads: freeByList.get(l.id) ?? 0,
    members: l.access.map((a) => a.user),
  }));
}

/** En mapp med sina leads. Returnerar null om användaren saknar åtkomst. */
export async function getList(listId: string) {
  const user = await requireAuth();
  if (!(await canAccessList(user, listId))) return null;

  const list = await db.callList.findUnique({
    where: { id: listId },
    include: {
      createdBy: { select: { id: true, name: true } },
      access: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!list) return null;

  const rows = await db.leadOnList.findMany({
    where: { listId },
    orderBy: { addedAt: "asc" },
    include: {
      lead: {
        include: {
          owner: { select: { id: true, name: true } },
          contacts: { orderBy: { createdAt: "asc" }, take: 1 },
          _count: { select: { contacts: true } },
          activities: {
            where: { type: { in: ["CALL", "CALL_NO_ANSWER"] } },
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { timestamp: true, type: true },
          },
        },
      },
    },
  });

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    sourceFile: list.sourceFile,
    isSystem: list.isSystem,
    createdAt: list.createdAt,
    createdBy: list.createdBy,
    members: list.access.map((a) => a.user),
    leads: rows.map((r) => r.lead),
  };
}

/** Säljare att välja bland när admin delar ut en mapp. */
export async function getAssignableUsers() {
  await requireAdmin();
  return db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
}

// ── Mutations: mappar ──────────────────────────────────────────────────────

export async function createList(input: {
  name: string;
  description?: string;
  sourceFile?: string;
  userIds?: string[];
}) {
  const admin = await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Mappen måste ha ett namn");

  const list = await db.callList.create({
    data: {
      name,
      description: input.description?.trim() || null,
      sourceFile: input.sourceFile?.trim() || null,
      createdById: admin.id,
      access: {
        create: Array.from(new Set(input.userIds ?? [])).map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/lists");
  return list;
}

export async function renameList(listId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Mappen måste ha ett namn");
  await db.callList.update({ where: { id: listId }, data: { name: trimmed } });
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

/**
 * Tar bort mappen — INTE leadsen. Ett lead som ligger i flera mappar
 * påverkas inte i de andra, och all historik ligger kvar på leadet.
 */
export async function deleteList(listId: string) {
  await requireAdmin();
  const list = await db.callList.findUnique({
    where: { id: listId },
    select: { isSystem: true },
  });
  if (!list) throw new Error("Mappen finns inte");
  if (list.isSystem) throw new Error("Systemmappar kan inte tas bort");

  await db.callList.delete({ where: { id: listId } });
  revalidatePath("/lists");
}

// ── Mutations: åtkomst ─────────────────────────────────────────────────────

/** Sätter exakt vilka användare som har tillgång till mappen. */
export async function setListAccess(listId: string, userIds: string[]) {
  await requireAdmin();
  const unique = Array.from(new Set(userIds));

  await db.$transaction([
    db.listAccess.deleteMany({ where: { listId, userId: { notIn: unique } } }),
    ...unique.map((userId) =>
      db.listAccess.upsert({
        where: { listId_userId: { listId, userId } },
        create: { listId, userId },
        update: {},
      })
    ),
  ]);

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function grantAccess(listId: string, userId: string) {
  await requireAdmin();
  await db.listAccess.upsert({
    where: { listId_userId: { listId, userId } },
    create: { listId, userId },
    update: {},
  });
  revalidatePath(`/lists/${listId}`);
}

export async function revokeAccess(listId: string, userId: string) {
  await requireAdmin();
  await db.listAccess.deleteMany({ where: { listId, userId } });
  revalidatePath(`/lists/${listId}`);
}

// ── Mutations: claim-lås ───────────────────────────────────────────────────

export type ClaimResult =
  | { ok: true; alreadyMine: boolean }
  | { ok: false; reason: "taken"; by: string }
  | { ok: false; reason: "forbidden" };

/**
 * Låser leadet till den som ringer. Först till kvarn — men bara om leadet är
 * ledigt (aldrig claimat, eller lås äldre än CLAIM_TTL_DAYS).
 *
 * Skrivningen är villkorad i WHERE-satsen, så två samtidiga claims kan inte
 * båda lyckas: den andra matchar noll rader.
 */
export async function claimLead(leadId: string): Promise<ClaimResult> {
  const user = await requireAuth();

  const lead = await db.lead.findFirst({
    where: { id: leadId, ...visibleLeadWhere(user) },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!lead) return { ok: false, reason: "forbidden" };

  const now = new Date();

  // Redan mitt och fortfarande giltigt → förnya låset
  if (lead.ownerId === user.id && !isLeadFree(lead, now)) {
    await db.lead.update({ where: { id: leadId }, data: { claimedAt: now } });
    return { ok: true, alreadyMine: true };
  }

  if (!isLeadFree(lead, now)) {
    return { ok: false, reason: "taken", by: lead.owner?.name ?? "annan säljare" };
  }

  // Villkorad uppdatering: leadet måste fortfarande vara ledigt när vi skriver
  const res = await db.lead.updateMany({
    where: { id: leadId, ...freeLeadWhere(now) },
    data: { ownerId: user.id, claimedAt: now },
  });

  if (res.count === 0) {
    const fresh = await db.lead.findUnique({
      where: { id: leadId },
      include: { owner: { select: { name: true } } },
    });
    return { ok: false, reason: "taken", by: fresh?.owner?.name ?? "annan säljare" };
  }

  await db.activity.create({
    data: {
      type: "LEAD_CLAIMED",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({ previousOwnerId: lead.ownerId }),
    },
  });

  revalidatePath("/lists");
  revalidatePath("/leads");
  return { ok: true, alreadyMine: false };
}

/** Släpper ett lead tillbaka till poolen. Ägaren själv eller admin. */
export async function releaseLead(leadId: string) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { ownerId: true, hasActiveDeal: true },
  });
  if (!lead) throw new Error("Leadet finns inte");

  if (!isAdminUser(user) && lead.ownerId !== user.id) {
    throw new Error("Du kan bara släppa dina egna leads");
  }
  if (lead.hasActiveDeal) {
    throw new Error("Leadet har en öppen affär och kan inte släppas");
  }

  await db.lead.update({ where: { id: leadId }, data: { claimedAt: null } });

  await db.activity.create({
    data: {
      type: "LEAD_RELEASED",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({ releasedBy: user.id }),
    },
  });

  revalidatePath("/lists");
  revalidatePath("/leads");
}

/** Admin frigör alla utgångna lås i en mapp på en gång. */
export async function releaseExpiredInList(listId: string) {
  await requireAdmin();
  const cutoff = claimCutoff();

  const rows = await db.leadOnList.findMany({
    where: {
      listId,
      lead: { claimedAt: { lt: cutoff }, hasActiveDeal: false },
    },
    select: { leadId: true },
  });

  if (rows.length > 0) {
    await db.lead.updateMany({
      where: { id: { in: rows.map((r) => r.leadId) } },
      data: { claimedAt: null },
    });
  }

  revalidatePath(`/lists/${listId}`);
  return rows.length;
}
