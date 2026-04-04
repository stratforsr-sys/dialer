"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ── Types ──────────────────────────────────────────────────────────────────

export type LeadWithMeta = Awaited<ReturnType<typeof getLeads>>[number];
export type LeadDetail = Awaited<ReturnType<typeof getLead>>;

// ── Queries ────────────────────────────────────────────────────────────────

export async function getLeads(filters?: {
  stageId?: string;
  search?: string;
  ownerId?: string;
}) {
  const user = await requireAuth();

  const where: Record<string, unknown> = {};

  // SELLER only sees own leads
  if (user.role === "SELLER") {
    where.ownerId = user.id;
  } else if (filters?.ownerId) {
    where.ownerId = filters.ownerId;
  }

  if (filters?.stageId) {
    where.stageId = filters.stageId;
  }

  if (filters?.search) {
    where.OR = [
      { companyName: { contains: filters.search } },
      { orgNumber: { contains: filters.search } },
    ];
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      stage: { select: { id: true, name: true, color: true } },
      owner: { select: { id: true, name: true } },
      _count: { select: { contacts: true, deals: true } },
      activities: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true, type: true },
      },
    },
  });

  return leads;
}

export async function getLead(id: string) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      stage: true,
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      deals: { orderBy: { createdAt: "desc" } },
      meetings: {
        orderBy: { scheduledAt: "desc" },
        include: {
          bookedBy: { select: { id: true, name: true } },
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

  if (!lead) return null;

  // SELLER can only view own leads (but can see activities from anyone)
  if (user.role === "SELLER" && lead.ownerId !== user.id) return null;

  return lead;
}

export async function getDefaultStage() {
  return db.pipelineStage.findFirst({ where: { isDefault: true } });
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

  const defaultStage = await getDefaultStage();
  if (!defaultStage) throw new Error("No default pipeline stage found");

  // Dedup: if orgNumber exists → update existing lead
  if (data.orgNumber) {
    const existing = await db.lead.findUnique({
      where: { orgNumber: data.orgNumber },
    });
    if (existing) {
      return updateLead(existing.id, data);
    }
  }

  const lead = await db.lead.create({
    data: {
      companyName: data.companyName,
      orgNumber: data.orgNumber || null,
      website: data.website || null,
      address: data.address || null,
      ownerId: user.id,
      stageId: defaultStage.id,
      contacts: data.contacts?.length
        ? { create: data.contacts }
        : undefined,
      activities: {
        create: {
          type: "LEAD_CREATED",
          actorId: user.id,
        },
      },
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
    stageId?: string;
  }
) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "SELLER" && lead.ownerId !== user.id) {
    throw new Error("Forbidden");
  }

  // Log stage change
  if (data.stageId && data.stageId !== lead.stageId) {
    const [fromStage, toStage] = await Promise.all([
      db.pipelineStage.findUnique({ where: { id: lead.stageId } }),
      db.pipelineStage.findUnique({ where: { id: data.stageId } }),
    ]);
    await db.activity.create({
      data: {
        type: "STAGE_CHANGE",
        actorId: user.id,
        leadId: id,
        metadata: JSON.stringify({ from: fromStage?.name, to: toStage?.name }),
      },
    });
  }

  const updated = await db.lead.update({ where: { id }, data });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return updated;
}

export async function deleteLead(id: string) {
  await requireAuth();
  // Only ADMIN can delete — enforced via requireAdmin in the calling component
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
      metadata: JSON.stringify({
        from: lead.owner.name,
        to: newOwner.name,
      }),
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}
