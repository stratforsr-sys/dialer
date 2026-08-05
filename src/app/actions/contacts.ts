"use server";

import { db } from "@/lib/db";
import { requireLeadAccess, requireContactAccess } from "@/lib/guard";
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
  const user = await requireLeadAccess(leadId);

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
  _leadId: string,
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
  // leadId från klienten används bara för revalidering — vilket lead kontakten
  // faktiskt tillhör avgörs av databasen, aldrig av anroparen.
  const { leadId } = await requireContactAccess(id);
  const contact = await db.contact.update({ where: { id }, data });
  revalidatePath(`/leads/${leadId}`);
  return contact;
}

export async function deleteContact(id: string, _leadId: string) {
  const { leadId } = await requireContactAccess(id);
  await db.contact.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
}
