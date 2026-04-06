"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getStages() {
  return db.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { deals: true } } },
  });
}

export async function createStage(data: { name: string; color: string; order: number }) {
  await requireAdmin();
  const stage = await db.pipelineStage.create({ data });
  revalidatePath("/pipeline");
  return stage;
}

export async function updateStage(id: string, data: { name?: string; color?: string; order?: number }) {
  await requireAdmin();
  const stage = await db.pipelineStage.update({ where: { id }, data });
  revalidatePath("/pipeline");
  return stage;
}

export async function deleteStage(id: string) {
  await requireAdmin();
  const count = await db.deal.count({ where: { stageId: id, status: "OPEN" } });
  if (count > 0) throw new Error(`${count} deals finns på det här steget. Flytta dem först.`);
  await db.pipelineStage.delete({ where: { id } });
  revalidatePath("/pipeline");
}
