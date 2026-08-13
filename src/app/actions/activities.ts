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

/**
 * Anteckning sparad med Enter mitt i ett samtal.
 *
 * Skiljer sig från `createNote` på två punkter, båda avsiktliga:
 *
 *  1. **Den returnerar raden.** Säljaren ska se anteckningen i historiken i
 *     samma ögonblick som hen trycker Enter, utan att sidan hämtas om.
 *     Cockpiten renderar svaret direkt.
 *  2. **Den bär `sessionId`.** Det är kopplingen som gör att anteckningen
 *     senare kan fällas ihop med samtalets utfall i stället för att ligga som
 *     en egen rad. Ett samtal och en anteckning hör ihop när de skrevs i
 *     samma ringpass — inte när de råkar ligga nära varandra i tid.
 *
 * `source: "cockpit"` är märkningen som skiljer dessa från anteckningar
 * skrivna på lead-sidan. Bara cockpit-anteckningar fälls ihop med ett utfall;
 * en anteckning någon skrev på lead-sidan i förrgår ska aldrig sugas in i
 * nästa samtal som råkar följa.
 */
export async function saveCockpitNote(input: {
  leadId: string;
  contactId?: string | null;
  sessionId?: string | null;
  note: string;
}) {
  const user = await requireLeadAccess(input.leadId);

  const text = input.note.trim();
  if (!text) throw new Error("Tom anteckning");

  const activity = await db.activity.create({
    data: {
      type: "NOTE",
      actorId: user.id,
      leadId: input.leadId,
      contactId: input.contactId || null,
      metadata: JSON.stringify({
        note: text,
        source: "cockpit",
        sessionId: input.sessionId ?? null,
      }),
    },
    select: {
      id: true,
      timestamp: true,
      metadata: true,
      actor: { select: { name: true } },
    },
  });

  // Ingen revalidatePath här. Cockpiten är en klientvy som redan har svaret,
  // och en revalidering mitt i ett samtal river renderingen under säljaren.
  return activity;
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
