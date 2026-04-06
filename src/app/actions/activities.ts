"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createNote(leadId: string, text: string, contactId?: string) {
  const user = await requireAuth();

  await db.activity.create({
    data: {
      type: "NOTE",
      actorId: user.id,
      leadId,
      contactId: contactId || null,
      metadata: JSON.stringify({ note: text }),
    },
  });

  revalidatePath(`/leads/${leadId}`);
}

export async function logCall(
  leadId: string,
  contactId: string | null,
  status: string,
  notes?: string
) {
  const user = await requireAuth();

  const type = status === "svarar_ej" ? "CALL_NO_ANSWER" : "CALL";

  await db.activity.create({
    data: {
      type,
      actorId: user.id,
      leadId,
      contactId: contactId || null,
      metadata: JSON.stringify({ status, notes }),
    },
  });

  // Auto-create deal when meeting is booked
  if (status === "bokat_mote") {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { companyName: true, hasActiveDeal: true },
    });

    if (lead && !lead.hasActiveDeal) {
      // Find "Möte bokat" stage (first stage with that name, or second stage by order)
      const meetingStage = await db.pipelineStage.findFirst({
        where: { name: { contains: "Möte" } },
        orderBy: { order: "asc" },
      }) ?? await db.pipelineStage.findFirst({ orderBy: { order: "asc" } });

      if (meetingStage) {
        await db.deal.create({
          data: {
            title: lead.companyName,
            stageId: meetingStage.id,
            valueType: "ONE_TIME",
            probability: 20,
            leadId,
            createdById: user.id,
          },
        });

        await db.lead.update({ where: { id: leadId }, data: { hasActiveDeal: true } });

        await db.activity.create({
          data: {
            type: "DEAL_CREATED",
            actorId: user.id,
            leadId,
            metadata: JSON.stringify({ title: lead.companyName, auto: true }),
          },
        });
      }
    }
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
}
