"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type LeadWithMeta = Awaited<ReturnType<typeof getLeads>>[number];
export type LeadDetail = Awaited<ReturnType<typeof getLead>>;

// ── Queries ────────────────────────────────────────────────────────────────

export async function getLeads(filters?: {
  search?: string;
  ownerId?: string;
  includeWithDeals?: boolean; // default false — hides leads with active deals
}) {
  const user = await requireAuth();

  const where: Record<string, unknown> = {};

  if (user.role === "SELLER") {
    where.ownerId = user.id;
  } else if (filters?.ownerId) {
    where.ownerId = filters.ownerId;
  }

  // Hide leads that have an active deal (they live in the pipeline now)
  if (!filters?.includeWithDeals) {
    where.hasActiveDeal = false;
  }

  if (filters?.search) {
    where.OR = [
      { companyName: { contains: filters.search } },
      { orgNumber: { contains: filters.search } },
    ];
  }

  return db.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
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

export async function getLead(id: string) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({
    where: { id },
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
      meetings: {
        orderBy: { scheduledAt: "desc" },
        include: { bookedBy: { select: { id: true, name: true } } },
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

  if (!lead) return null;
  if (user.role === "SELLER" && lead.ownerId !== user.id) return null;

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

export async function deleteLead(id: string) {
  await requireAuth();
  await db.lead.delete({ where: { id } });
  revalidatePath("/leads");
}

export async function reassignLead(id: string, newOwnerId: string) {
  const user = await requireAuth();

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
