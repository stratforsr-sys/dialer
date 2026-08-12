"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { visibleLeadWhere } from "@/lib/lists";
import { LEADS_PAGE_SIZE } from "@/lib/constants";
import type { Prisma } from "@/generated/prisma/client";

export type LeadWithMeta = Awaited<ReturnType<typeof getLeads>>[number];
export type LeadDetail = Awaited<ReturnType<typeof getLead>>;

// ── Queries ────────────────────────────────────────────────────────────────

export async function getLeads(filters?: {
  search?: string;
  ownerId?: string;
  includeWithDeals?: boolean; // default false — hides leads with active deals
  take?: number;
}) {
  const user = await requireAuth();

  // AND-lista i stället för ett platt objekt: både synligheten och sökningen
  // behöver varsitt OR, och de får inte skriva över varandra.
  const and: Prisma.LeadWhereInput[] = [
    // Säljare ser sina egna leads + allt i mappar de har tillgång till.
    // Admin ser allt (visibleLeadWhere returnerar tomt filter).
    visibleLeadWhere(user),
  ];

  if (user.role === "ADMIN" && filters?.ownerId) {
    and.push({ ownerId: filters.ownerId });
  }

  // Hide leads that have an active deal (they live in the pipeline now)
  if (!filters?.includeWithDeals) {
    and.push({ hasActiveDeal: false });
  }

  if (filters?.search) {
    and.push({
      OR: [
        { companyName: { contains: filters.search } },
        { orgNumber: { contains: filters.search } },
      ],
    });
  }

  return db.lead.findMany({
    where: { AND: and },
    orderBy: { updatedAt: "desc" },
    take: filters?.take ?? LEADS_PAGE_SIZE,
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { contacts: true, deals: true } },
      activities: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true, type: true },
      },
    },
  });
}

/** Hur många leads som matchar filtret totalt — driver "visar X av Y". */
export async function countLeads(filters?: {
  search?: string;
  ownerId?: string;
  includeWithDeals?: boolean;
}) {
  const user = await requireAuth();

  const and: Prisma.LeadWhereInput[] = [visibleLeadWhere(user)];

  if (user.role === "ADMIN" && filters?.ownerId) {
    and.push({ ownerId: filters.ownerId });
  }
  if (!filters?.includeWithDeals) {
    and.push({ hasActiveDeal: false });
  }
  if (filters?.search) {
    and.push({
      OR: [
        { companyName: { contains: filters.search } },
        { orgNumber: { contains: filters.search } },
      ],
    });
  }

  return db.lead.count({ where: { AND: and } });
}

export async function getLead(id: string) {
  const user = await requireAuth();

  const lead = await db.lead.findFirst({
    // Åtkomst: eget lead eller lead i en mapp man är tilldelad
    where: { AND: [{ id }, visibleLeadWhere(user)] },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      deals: {
        orderBy: { createdAt: "desc" },
        include: {
          stage: true,
          products: { include: { product: true } },
        },
      },
      activities: {
        orderBy: { timestamp: "desc" },
        take: 50,
        include: {
          actor: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
        },
      },
      tags: { include: { tag: true } },
    },
  });

  return lead;
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createLead(data: {
  companyName: string;
  orgNumber?: string;
  website?: string;
  address?: string;
  contacts?: Array<{
    name: string;
    role?: string;
    directPhone?: string;
    switchboard?: string;
    email?: string;
    linkedin?: string;
  }>;
}) {
  const user = await requireAuth();

  // Dedup: if orgNumber exists → update existing lead
  if (data.orgNumber) {
    const existing = await db.lead.findUnique({ where: { orgNumber: data.orgNumber } });
    if (existing) return updateLead(existing.id, data);
  }

  const lead = await db.lead.create({
    data: {
      companyName: data.companyName,
      orgNumber: data.orgNumber || null,
      website: data.website || null,
      address: data.address || null,
      ownerId: user.id,
      contacts: data.contacts?.length ? { create: data.contacts } : undefined,
      activities: { create: { type: "LEAD_CREATED", actorId: user.id } },
    },
  });

  revalidatePath("/leads");
  return lead;
}

export async function updateLead(
  id: string,
  data: {
    companyName?: string;
    orgNumber?: string;
    website?: string;
    address?: string;
  }
) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "SELLER" && lead.ownerId !== user.id) throw new Error("Forbidden");

  const updated = await db.lead.update({ where: { id }, data });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return updated;
}

/**
 * Endast admin. Raderingen kaskaderar ner i kontakter, aktiviteter, möten och
 * affärer — aktivitetsloggen ska vara oföränderlig, så det här är den enda
 * vägen den kan försvinna. Den vägen får inte stå öppen för säljare.
 */
export async function deleteLead(id: string) {
  await requireAdmin();
  await db.lead.delete({ where: { id } });
  revalidatePath("/leads");
}

/** Endast admin — annars går claim-låset att kringgå genom att flytta leadet till sig själv. */
export async function reassignLead(id: string, newOwnerId: string) {
  const user = await requireAdmin();

  const lead = await db.lead.findUnique({
    where: { id },
    include: { owner: { select: { name: true } } },
  });
  if (!lead) throw new Error("Lead not found");

  const newOwner = await db.user.findUnique({ where: { id: newOwnerId } });
  if (!newOwner) throw new Error("User not found");

  await db.lead.update({ where: { id }, data: { ownerId: newOwnerId } });
  await db.activity.create({
    data: {
      type: "LEAD_ASSIGNED",
      actorId: user.id,
      leadId: id,
      metadata: JSON.stringify({ from: lead.owner.name, to: newOwner.name }),
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

/**
 * Snabbsökning över de leads användaren faktiskt har tillgång till.
 *
 * Driver sökfältet på Ringlistor, som numera är enda vägen in till ett enskilt
 * lead — lead-listan är borttagen ur menyn. Därför söker den bredare än
 * `getLeads`: en säljare som letar efter ett bolag minns lika ofta personens
 * namn eller de sista siffrorna i numret som firmanamnet.
 *
 * Skiljer sig från `getLeads` på tre punkter, alla medvetna:
 *
 *  - **`hasActiveDeal` filtreras inte bort.** Ett lead som blivit en affär ska
 *    gå att hitta; det är ofta då man letar efter det.
 *  - **Retirerade tas med.** "Varför ringer vi inte det här bolaget?" är en
 *    fråga sökningen ska kunna svara på, inte dölja.
 *  - **Liten `take`.** Det här är en snabbsökning i en dropdown, inte en
 *    tabell. Fler än tolv träffar betyder att man ska skriva mer, inte scrolla.
 */
export async function searchAssignedLeads(query: string) {
  const user = await requireAuth();

  const q = query.trim();
  // Två tecken är minimum. Ett tecken matchar halva databasen och kostar en
  // full tabellskanning för ett resultat ingen kan använda.
  if (q.length < 2) return [];

  // Siffror i ett telefonnummer skrivs på fem sätt. Normalisera bort allt utom
  // siffror så att "070-123 45 67" hittar "+46701234567" — E164-kolumnerna
  // lagrar bara siffror och plus.
  const digits = q.replace(/\D/g, "");
  const phoneQuery = digits.length >= 4 ? digits.replace(/^0/, "") : null;

  const or: Prisma.LeadWhereInput[] = [
    { companyName: { contains: q } },
    { orgNumber: { contains: q } },
    { city: { contains: q } },
    { contacts: { some: { name: { contains: q } } } },
  ];

  if (phoneQuery) {
    or.push(
      { contacts: { some: { directPhoneE164: { contains: phoneQuery } } } },
      { contacts: { some: { switchboardE164: { contains: phoneQuery } } } },
      { contacts: { some: { directPhone: { contains: digits } } } }
    );
  }

  const leads = await db.lead.findMany({
    where: { AND: [visibleLeadWhere(user), { OR: or }] },
    take: 12,
    // Senast rörda först: letar man efter ett bolag är det oftast ett man
    // nyligen haft att göra med.
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyName: true,
      city: true,
      industry: true,
      retired: true,
      retiredReason: true,
      hasActiveDeal: true,
      callbackAt: true,
      lastAttemptAt: true,
      contacts: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { name: true, directPhoneE164: true, directPhone: true },
      },
      lists: {
        take: 1,
        select: { list: { select: { id: true, name: true } } },
      },
    },
  });

  return leads.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    city: l.city,
    industry: l.industry,
    retired: l.retired,
    retiredReason: l.retiredReason,
    hasActiveDeal: l.hasActiveDeal,
    callbackAt: l.callbackAt,
    lastAttemptAt: l.lastAttemptAt,
    contactName: l.contacts[0]?.name ?? null,
    phone: l.contacts[0]?.directPhoneE164 ?? l.contacts[0]?.directPhone ?? null,
    listId: l.lists[0]?.list.id ?? null,
    listName: l.lists[0]?.list.name ?? null,
  }));
}

export type LeadSearchHit = Awaited<ReturnType<typeof searchAssignedLeads>>[number];
