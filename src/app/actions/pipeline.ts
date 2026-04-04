"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getStages() {
  return db.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { leads: true } } },
  });
}

export async function moveLeadToStage(leadId: string, stageId: string) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { stage: true },
  });
  if (!lead) throw new Error("Lead not found");

  const toStage = await db.pipelineStage.findUnique({ where: { id: stageId } });
  if (!toStage) throw new Error("Stage not found");

  await db.lead.update({ where: { id: leadId }, data: { stageId } });
  await db.activity.create({
    data: {
      type: "STAGE_CHANGE",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({ from: lead.stage.name, to: toStage.name }),
    },
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath(`/leads/${leadId}`);
}

export async function createStage(data: {
  name: string;
  color: string;
  order: number;
}) {
  await requireAdmin();
  const stage = await db.pipelineStage.create({ data });
  revalidatePath("/pipeline");
  return stage;
}

export async function updateStage(
  id: string,
  data: { name?: string; color?: string; order?: number }
) {
  await requireAdmin();
  const stage = await db.pipelineStage.update({ where: { id }, data });
  revalidatePath("/pipeline");
  return stage;
}

export async function deleteStage(id: string) {
  await requireAdmin();
  const count = await db.lead.count({ where: { stageId: id } });
  if (count > 0) throw new Error(`${count} leads finns på det här steget. Flytta dem först.`);
  await db.pipelineStage.delete({ where: { id } });
  revalidatePath("/pipeline");
}
