"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  claimCutoff,
  claimedByWhere,
  freeLeadWhere,
  isAdminUser,
  visibleLeadWhere,
} from "@/lib/lists";
import { SYSTEM_USER_EMAIL } from "@/lib/system-user";

export type ListSummary = Awaited<ReturnType<typeof getLists>>[number];
export type ListDetail = NonNullable<Awaited<ReturnType<typeof getList>>>;

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Alla mappar användaren har tillgång till, med räknare för framsteg.
 * Framsteg = andel leads i mappen som någon har ringt.
 */
export async function getLists() {
  const user = await requireAuth();

  // Åtkomstfiltret som villkor i stället för en separat id-hämtning: sparar
  // en round-trip, och databasen är ändå snabbare på joinen än vi är på att
  // skicka en lista med id:n fram och tillbaka.
  const lists = await db.callList.findMany({
    where: {
      archived: false,
      ...(isAdminUser(user) ? {} : { access: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      access: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { leads: true } },
    },
  });

  if (lists.length === 0) return [];

  const cutoff = claimCutoff();
  const listIds = lists.map((l) => l.id);

  // De två aggregaten är oberoende av varandra — kör dem samtidigt
  const [claimed, free] = await Promise.all([
    db.leadOnList.groupBy({
      by: ["listId"],
      where: { listId: { in: listIds }, lead: { claimedAt: { not: null } } },
      _count: { leadId: true },
    }),
    db.leadOnList.groupBy({
      by: ["listId"],
      where: {
        listId: { in: listIds },
        lead: { OR: [{ claimedAt: null }, { claimedAt: { lt: cutoff } }] },
      },
      _count: { leadId: true },
    }),
  ]);

  const claimedByList = new Map(claimed.map((c) => [c.listId, c._count.leadId]));
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

  // Åtkomstkollen bakas in i mappfrågan (en round-trip i stället för två),
  // och leadsen hämtas samtidigt. Saknar användaren åtkomst blir list null
  // och vi kastar leadsen — de har ändå aldrig lämnat servern.
  const [list, rows, cfg] = await Promise.all([
    db.callList.findFirst({
      where: {
        id: listId,
        ...(isAdminUser(user) ? {} : { access: { some: { userId: user.id } } }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        access: { include: { user: { select: { id: true, name: true, email: true } } } },
        // Mappens egna manus. Bara de aktiva och publicerade räknas — ett
        // utkast syns aldrig för säljaren, och en rad som påstår att mappen
        // har ett eget manus när ingen får se det är värre än ingen rad.
        scripts: {
          where: { active: true, versions: { some: { publishedAt: { not: null } } } },
          select: { id: true, step: true, name: true },
        },
      },
    }),
    db.leadOnList.findMany({
      where: { listId },
      orderBy: { addedAt: "asc" },
      include: {
        lead: {
          include: {
            owner: { select: { id: true, name: true } },
            contacts: { orderBy: { createdAt: "asc" }, take: 1 },
            _count: { select: { contacts: true } },
            // Spärrlistan. Resten av det `deckState` behöver — retired,
            // hasActiveDeal, attemptCount, callbackAt, nextActionAt,
            // lastOutcome — är skalärer och följer redan med `include`.
            dnc: { select: { expiresAt: true } },
            activities: {
              where: { type: { in: ["CALL", "CALL_NO_ANSWER"] } },
              orderBy: { timestamp: "desc" },
              take: 1,
              select: { timestamp: true, type: true },
            },
          },
        },
      },
    }),
    // Taket bor i DialerConfig och kan ändras utan deploy. Mappvyn måste läsa
    // det ur samma ställe som däcket, annars ritar den "taket nått" på en
    // gräns som inte längre gäller.
    db.dialerConfig.findUnique({
      where: { id: "singleton" },
      select: { maxAttempts: true },
    }),
  ]);

  if (!list) return null;

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    sourceFile: list.sourceFile,
    isSystem: list.isSystem,
    createdAt: list.createdAt,
    createdBy: list.createdBy,
    members: list.access.map((a) => a.user),
    scripts: list.scripts,
    /** Däckets tak — driver `deckState` i mappvyn. */
    maxAttempts: cfg?.maxAttempts ?? 8,
    leads: rows.map((r) => r.lead),
  };
}

/** Säljare att välja bland när admin delar ut en mapp. Gravstenskontot för
 *  raderade användare är inte en av dem — det finns bara för att bära
 *  historik och kan inte logga in. */
export async function getAssignableUsers() {
  await requireAdmin();
  return db.user.findMany({
    where: { email: { not: SYSTEM_USER_EMAIL } },
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

/** SQLite har ett tak för antal parametrar i en IN-lista. */
function chunk<T>(items: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type DeleteListResult = {
  /** Leads som importen skapade och som nu är borta. */
  deletedLeads: number;
  /** Dubbletter — fanns i dialern redan innan importen, och ligger kvar. */
  keptDuplicates: number;
  /** Skapade här, men ligger även i en annan mapp och sparades därför. */
  keptInOtherLists: number;
};

/**
 * Tar bort mappen OCH de leads mappen själv skapade.
 *
 * Delningen går på LeadOnList.createdByImport, satt när importen kördes:
 *
 *   createdByImport = true   importen hittade inget bolag på org-numret och
 *                            skapade leadet → det försvinner med mappen
 *   createdByImport = false  leadet fanns redan i dialern och länkades bara in
 *                            (dubbletten) → det ligger kvar
 *
 * Undantag: ett lead som den här importen skapade men som sedan hamnat i en
 * ANNAN mapp raderas inte. Annars tömmer den här borttagningen någon annans
 * ringlista på leads de står och ringer.
 *
 * Att radera ett lead kaskaderar bort dess kontakter, aktiviteter, affärer och
 * CallAttempt-rader. Statistiken för de samtalen försvinner alltså också — det
 * är priset för att en felimporterad lista ska gå att ångra helt.
 */
export async function deleteList(listId: string): Promise<DeleteListResult> {
  await requireAdmin();
  const list = await db.callList.findUnique({
    where: { id: listId },
    select: { isSystem: true },
  });
  if (!list) throw new Error("Mappen finns inte");
  if (list.isSystem) throw new Error("Systemmappar kan inte tas bort");

  // Måste läsas FÖRE borttagningen: CallList kaskaderar bort LeadOnList-raderna,
  // och då är kopplingen som säger vad mappen skapade redan borta.
  const links = await db.leadOnList.findMany({
    where: { listId },
    select: { leadId: true, createdByImport: true },
  });

  const createdHere = links.filter((l) => l.createdByImport).map((l) => l.leadId);
  const keptDuplicates = links.length - createdHere.length;

  const shared = new Set<string>();
  for (const batch of chunk(createdHere)) {
    const elsewhere = await db.leadOnList.findMany({
      where: { leadId: { in: batch }, listId: { not: listId } },
      select: { leadId: true },
    });
    for (const l of elsewhere) shared.add(l.leadId);
  }

  const toDelete = createdHere.filter((id) => !shared.has(id));

  // Mappens egna manus inaktiveras FÖRE borttagningen. Texten får inte
  // kaskadera bort — publicerade versioner ligger på CallAttempt-rader och bär
  // statistikens koppling till vad som faktiskt sades. Men de får inte heller
  // bli kvar aktiva: FK:n nollar `listId` när mappen försvinner, och ett aktivt
  // manus utan mapp gäller alla mappar. Ett kampanjmanus hade alltså plötsligt
  // mött hela golvet i det ögonblick kampanjmappen raderades.
  await db.scriptTemplate.updateMany({
    where: { listId },
    data: { active: false },
  });

  await db.callList.delete({ where: { id: listId } });
  for (const batch of chunk(toDelete)) {
    await db.lead.deleteMany({ where: { id: { in: batch } } });
  }

  revalidatePath("/lists");
  revalidatePath("/leads");
  revalidatePath("/deals");

  return { deletedLeads: toDelete.length, keptDuplicates, keptInOtherLists: shared.size };
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
  | { ok: true }
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
  const now = new Date();

  // Detta är dialerns varmaste väg — den körs på varje loggat samtal. Därför
  // går vi rakt på den villkorade skrivningen i stället för att läsa först:
  // WHERE-satsen släpper bara igenom leads som är synliga för användaren OCH
  // lediga (eller redan hens). Lyckas den är vi klara på en round-trip.
  const claimed = await db.lead.updateMany({
    where: {
      AND: [
        { id: leadId },
        visibleLeadWhere(user),
        { OR: [freeLeadWhere(now), claimedByWhere(user.id, now)] },
      ],
    },
    data: { ownerId: user.id, claimedAt: now },
  });

  if (claimed.count > 0) {
    // Loggen behöver inte blockera svaret — säljaren ska vidare till nästa samtal
    void db.activity
      .create({
        data: {
          type: "LEAD_CLAIMED",
          actorId: user.id,
          leadId,
          metadata: JSON.stringify({ claimedAt: now.toISOString() }),
        },
      })
      .catch(() => {});

    revalidatePath("/lists");
    revalidatePath("/leads");
    return { ok: true };
  }

  // Skrivningen tog inte — ta reda på varför först nu, i det ovanliga fallet
  const lead = await db.lead.findFirst({
    where: { AND: [{ id: leadId }, visibleLeadWhere(user)] },
    select: { ownerId: true, claimedAt: true, owner: { select: { name: true } } },
  });

  if (!lead) return { ok: false, reason: "forbidden" };
  return { ok: false, reason: "taken", by: lead.owner?.name ?? "annan säljare" };
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
