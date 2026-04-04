"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type ImportRow = {
  companyName: string;
  orgNumber?: string;
  website?: string;
  contactName?: string;
  contactRole?: string;
  directPhone?: string;
  switchboard?: string;
  email?: string;
  linkedin?: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function importLeads(rows: ImportRow[]): Promise<ImportResult> {
  const user = await requireAuth();

  const defaultStage = await db.pipelineStage.findFirst({
    where: { isDefault: true },
  });
  if (!defaultStage) throw new Error("No default pipeline stage found");

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    if (!row.companyName?.trim()) {
      result.skipped++;
      continue;
    }

    try {
      const orgNumber = row.orgNumber?.trim() || null;

      // Check for existing lead by orgNumber
      const existing = orgNumber
        ? await db.lead.findUnique({ where: { orgNumber } })
        : null;

      if (existing) {
        // Update existing lead
        await db.lead.update({
          where: { id: existing.id },
          data: {
            companyName: row.companyName.trim(),
            website: row.website?.trim() || existing.website,
          },
        });

        // Add contact if provided and not duplicate phone/email
        if (row.contactName?.trim()) {
          const existingContact = await db.contact.findFirst({
            where: {
              leadId: existing.id,
              OR: [
                row.email ? { email: row.email.trim() } : {},
                row.directPhone ? { directPhone: row.directPhone.trim() } : {},
              ].filter((c) => Object.keys(c).length > 0),
            },
          });

          if (!existingContact) {
            await db.contact.create({
              data: {
                leadId: existing.id,
                name: row.contactName.trim(),
                role: row.contactRole?.trim() || null,
                directPhone: row.directPhone?.trim() || null,
                switchboard: row.switchboard?.trim() || null,
                email: row.email?.trim() || null,
                linkedin: row.linkedin?.trim() || null,
              },
            });
          }
        }

        await db.activity.create({
          data: {
            type: "LEAD_IMPORTED",
            actorId: user.id,
            leadId: existing.id,
            metadata: JSON.stringify({ action: "updated" }),
          },
        });

        result.updated++;
      } else {
        // Create new lead
        const lead = await db.lead.create({
          data: {
            companyName: row.companyName.trim(),
            orgNumber,
            website: row.website?.trim() || null,
            ownerId: user.id,
            stageId: defaultStage.id,
            contacts: row.contactName?.trim()
              ? {
                  create: {
                    name: row.contactName.trim(),
                    role: row.contactRole?.trim() || null,
                    directPhone: row.directPhone?.trim() || null,
                    switchboard: row.switchboard?.trim() || null,
                    email: row.email?.trim() || null,
                    linkedin: row.linkedin?.trim() || null,
                  },
                }
              : undefined,
            activities: {
              create: {
                type: "LEAD_IMPORTED",
                actorId: user.id,
                metadata: JSON.stringify({ action: "created" }),
              },
            },
          },
        });

        result.created++;
      }
    } catch (err) {
      result.errors.push(
        `${row.companyName}: ${err instanceof Error ? err.message : "Okänt fel"}`
      );
    }
  }

  revalidatePath("/leads");
  return result;
}
