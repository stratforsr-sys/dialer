"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type DealWithRelations = Awaited<ReturnType<typeof getDealsForPipeline>>[number];

// ── Queries ────────────────────────────────────────────────────────────────

export async function getDealsForPipeline() {
  await requireAuth();
  return db.deal.findMany({
    where: { status: "OPEN" },
    orderBy: { updatedAt: "desc" },
    include: {
      stage: true,
      lead: { select: { id: true, companyName: true, website: true, owner: { select: { id: true, name: true } } } },
      products: { include: { product: true } },
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createDeal(data: {
  leadId: string;
  title: string;
  stageId: string;
  valueType: "ONE_TIME" | "ARR";
  oneTimeValue?: number | null;
  arrValue?: number | null;
  probability?: number;
  expectedCloseAt?: Date | null;
  notes?: string;
  products?: Array<{
    productId?: string | null;
    name: string;
    price?: number | null;
    quantity?: number;
    isRecurring?: boolean;
    unit?: string;
  }>;
}) {
  const user = await requireAuth();

  const deal = await db.deal.create({
    data: {
      title: data.title,
      stageId: data.stageId,
      valueType: data.valueType,
      oneTimeValue: data.oneTimeValue ?? null,
      arrValue: data.arrValue ?? null,
      probability: data.probability ?? 20,
      expectedCloseAt: data.expectedCloseAt ?? null,
      notes: data.notes ?? null,
      leadId: data.leadId,
      createdById: user.id,
      products: data.products?.length
        ? {
            create: data.products.map((p) => ({
              productId: p.productId ?? null,
              name: p.name,
              price: p.price ?? null,
              quantity: p.quantity ?? 1,
              isRecurring: p.isRecurring ?? false,
              unit: p.unit ?? null,
            })),
          }
        : undefined,
    },
  });

  // Mark lead as having an active deal (hides it from leads list/cockpit)
  await db.lead.update({
    where: { id: data.leadId },
    data: { hasActiveDeal: true },
  });

  // Log activity
  await db.activity.create({
    data: {
      type: "DEAL_CREATED",
      actorId: user.id,
      leadId: data.leadId,
      metadata: JSON.stringify({ dealId: deal.id, title: deal.title }),
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath(`/leads/${data.leadId}`);
  return deal;
}

export async function moveDealToStage(dealId: string, stageId: string) {
  const user = await requireAuth();

  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { stage: true } });
  if (!deal) throw new Error("Deal not found");

  const toStage = await db.pipelineStage.findUnique({ where: { id: stageId } });
  if (!toStage) throw new Error("Stage not found");

  await db.deal.update({ where: { id: dealId }, data: { stageId } });

  await db.activity.create({
    data: {
      type: "DEAL_STAGE_CHANGE",
      actorId: user.id,
      leadId: deal.leadId,
      metadata: JSON.stringify({ dealId, from: deal.stage.name, to: toStage.name }),
    },
  });

  revalidatePath("/pipeline");
}

export async function closeDeal(dealId: string, status: "WON" | "LOST", notes?: string) {
  const user = await requireAuth();

  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal not found");

  await db.deal.update({ where: { id: dealId }, data: { status, notes: notes ?? deal.notes } });

  // If no more open deals → un-hide the lead
  const openDeals = await db.deal.count({
    where: { leadId: deal.leadId, status: "OPEN", id: { not: dealId } },
  });
  if (openDeals === 0) {
    await db.lead.update({ where: { id: deal.leadId }, data: { hasActiveDeal: false } });
  }

  await db.activity.create({
    data: {
      type: status === "WON" ? "DEAL_WON" : "DEAL_LOST",
      actorId: user.id,
      leadId: deal.leadId,
      metadata: JSON.stringify({ dealId, title: deal.title }),
    },
  });

  revalidatePath("/pipeline");
  revalidatePath(`/leads/${deal.leadId}`);
}

export async function updateDeal(
  dealId: string,
  data: {
    title?: string;
    valueType?: "ONE_TIME" | "ARR";
    oneTimeValue?: number | null;
    arrValue?: number | null;
    probability?: number;
    expectedCloseAt?: Date | null;
    notes?: string;
    stageId?: string;
  }
) {
  await requireAuth();
  const deal = await db.deal.update({ where: { id: dealId }, data });
  revalidatePath("/pipeline");
  revalidatePath(`/leads/${deal.leadId}`);
  return deal;
}
