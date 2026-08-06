"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { toE164 } from "@/lib/phone";
import { resolveIndustry } from "@/lib/sni";

type ImportRow = {
  companyName: string;
  orgNumber?: string;
  website?: string;
  address?: string;
  city?: string;
  industry?: string;
  industryCode?: string;
  employees?: number;
  revenue?: number;
  contactName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactRole?: string;
  directPhone?: string;
  switchboard?: string;
  email?: string;
  linkedin?: string;
};

/** Samma försvar som i /api/import-stream — icke-tal ska bli null, inte NaN. */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** Samma regel som i /api/import-stream: hel namnkolumn vinner, annars delarna. */
function contactNameOf(row: ImportRow): string | null {
  const whole = row.contactName?.trim();
  if (whole) return whole;
  const parts = [row.contactFirstName?.trim(), row.contactLastName?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function importLeads(rows: ImportRow[]): Promise<ImportResult> {
  const user = await requireAuth();

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    if (!row.companyName?.trim()) {
      result.skipped++;
      continue;
    }

    try {
      const orgNumber = row.orgNumber?.trim() || null;
      const contactName = contactNameOf(row);

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
            address: row.address?.trim() || existing.address,
            city: row.city?.trim() || existing.city,
            industry: resolveIndustry(row.industry, row.industryCode) ?? existing.industry,
            industryCode: row.industryCode?.trim() || existing.industryCode,
            employees: int(row.employees) ?? existing.employees,
            revenue: num(row.revenue) ?? existing.revenue,
          },
        });

        // Add contact if provided and not duplicate phone/email
        if (contactName) {
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
                name: contactName,
                firstName: row.contactFirstName?.trim() || null,
                lastName: row.contactLastName?.trim() || null,
                role: row.contactRole?.trim() || null,
                directPhone: row.directPhone?.trim() || null,
                switchboard: row.switchboard?.trim() || null,
                directPhoneE164: toE164(row.directPhone),
                switchboardE164: toE164(row.switchboard),
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
            address: row.address?.trim() || null,
            city: row.city?.trim() || null,
            industry: resolveIndustry(row.industry, row.industryCode),
            industryCode: row.industryCode?.trim() || null,
            employees: int(row.employees),
            revenue: num(row.revenue),
            ownerId: user.id,
            contacts: contactName
              ? {
                  create: {
                    name: contactName,
                    firstName: row.contactFirstName?.trim() || null,
                    lastName: row.contactLastName?.trim() || null,
                    role: row.contactRole?.trim() || null,
                    directPhone: row.directPhone?.trim() || null,
                    switchboard: row.switchboard?.trim() || null,
                    directPhoneE164: toE164(row.directPhone),
                    switchboardE164: toE164(row.switchboard),
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
