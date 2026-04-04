"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createContact(
  leadId: string,
  data: {
    name: string;
    role?: string;
    directPhone?: string;
    switchboard?: string;
    email?: string;
    linkedin?: string;
    notes?: string;
  }
) {
  const user = await requireAuth();

  const contact = await db.contact.create({
    data: { ...data, leadId },
  });

  await db.activity.create({
    data: {
      type: "CONTACT_ADDED",
      actorId: user.id,
      leadId,
      contactId: contact.id,
      metadata: JSON.stringify({ name: data.name, role: data.role }),
    },
  });

  revalidatePath(`/leads/${leadId}`);
  return contact;
}

export async function updateContact(
  id: string,
  leadId: string,
  data: {
    name?: string;
    role?: string;
    directPhone?: string;
    switchboard?: string;
    email?: string;
    linkedin?: string;
    notes?: string;
  }
) {
  await requireAuth();
  const contact = await db.contact.update({ where: { id }, data });
  revalidatePath(`/leads/${leadId}`);
  return contact;
}

export async function deleteContact(id: string, leadId: string) {
  await requireAuth();
  await db.contact.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
}
