"use server";

import { db } from "@/lib/db";
import { requireLeadAccess, requireContactAccess } from "@/lib/guard";
import { revalidatePath } from "next/cache";
import { toE164 } from "@/lib/phone";

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

  // E164 sätts här, inte bara vid importen. Cockpiten ringer på E164-fälten och
  // telefonin loggar `dialedE164` — ett nummer som sparats för hand utan
  // normalisering syns i kortet men går inte att ringa, vilket är exakt den
  // återvändsgränd rutan "lägg till nummer" finns för att ta bort.
  const contact = await db.contact.create({
    data: {
      ...data,
      leadId,
      directPhoneE164: toE164(data.directPhone),
      switchboardE164: toE164(data.switchboard),
    },
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
  // Bara de nummer som faktiskt skickas med rörs — `undefined` betyder "ändra
  // inte", och att skriva null där hade tömt E164 på en kontakt vars namn
  // rättades.
  const contact = await db.contact.update({
    where: { id },
    data: {
      ...data,
      ...(data.directPhone !== undefined ? { directPhoneE164: toE164(data.directPhone) } : {}),
      ...(data.switchboard !== undefined ? { switchboardE164: toE164(data.switchboard) } : {}),
    },
  });
  revalidatePath(`/leads/${leadId}`);
  return contact;
}

export async function deleteContact(id: string, _leadId: string) {
  const { leadId } = await requireContactAccess(id);
  await db.contact.delete({ where: { id } });
  revalidatePath(`/leads/${leadId}`);
}
