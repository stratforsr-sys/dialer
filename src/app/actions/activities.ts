"use server";

import { db } from "@/lib/db";
import { requireLeadAccess } from "@/lib/guard";
import { revalidatePath } from "next/cache";

export async function createNote(leadId: string, text: string, contactId?: string) {
  const user = await requireLeadAccess(leadId);

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
  // Utan grinden kunde vilket leadId som helst skickas in.
  const user = await requireLeadAccess(leadId);

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

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
}
