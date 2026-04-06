import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 300;

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

const BATCH_SIZE = 200;

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { rows }: { rows: ImportRow[] } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(encoder.encode(sse(data)));

      try {
        // Filter out blank rows up front
        const validRows = rows.filter((r) => r.companyName?.trim());
        const skipped = rows.length - validRows.length;
        const total = validRows.length;
        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        enqueue({ total, created: 0, updated: 0, skipped, done: 0 });

        if (total === 0) {
          enqueue({ complete: true, total, created, updated, skipped, errors });
          controller.close();
          return;
        }

        // ── Pre-load ALL existing leads matching any org number in one query ──
        const allOrgNumbers = validRows
          .map((r) => r.orgNumber?.trim())
          .filter(Boolean) as string[];

        const existingLeads =
          allOrgNumbers.length > 0
            ? await db.lead.findMany({
                where: { orgNumber: { in: allOrgNumbers } },
                select: {
                  id: true,
                  orgNumber: true,
                  website: true,
                  contacts: {
                    select: {
                      id: true,
                      email: true,
                      directPhone: true,
                    },
                  },
                },
              })
            : [];

        // O(1) lookup map: orgNumber → existing lead
        const existingByOrg = new Map(
          existingLeads.map((l) => [l.orgNumber!, l])
        );

        // ── Process in batches ───────────────────────────────────────────────
        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          const batch = validRows.slice(i, i + BATCH_SIZE);

          type ExistingLead = (typeof existingLeads)[number];
          const newRows: ImportRow[] = [];
          const existingRows: { row: ImportRow; lead: ExistingLead }[] = [];

          for (const row of batch) {
            const orgNum = row.orgNumber?.trim() || null;
            const existing = orgNum ? existingByOrg.get(orgNum) : null;
            if (existing) {
              existingRows.push({ row, lead: existing });
            } else {
              newRows.push(row);
            }
          }

          // ── NEW LEADS: createMany in 3 queries ──────────────────────────
          if (newRows.length > 0) {
            const now = new Date();

            // Pre-generate IDs so we can link contacts + activities
            const leadData = newRows.map((row) => ({
              id: randomUUID(),
              companyName: row.companyName.trim(),
              orgNumber: row.orgNumber?.trim() || null,
              website: row.website?.trim() || null,
              ownerId: session.user.id,
              createdAt: now,
              updatedAt: now,
            }));

            await db.lead.createMany({ data: leadData });

            // Contacts
            const contactData = newRows
              .map((row, idx) =>
                row.contactName?.trim()
                  ? {
                      id: randomUUID(),
                      leadId: leadData[idx].id,
                      name: row.contactName.trim(),
                      role: row.contactRole?.trim() || null,
                      directPhone: row.directPhone?.trim() || null,
                      switchboard: row.switchboard?.trim() || null,
                      email: row.email?.trim() || null,
                      linkedin: row.linkedin?.trim() || null,
                      createdAt: now,
                      updatedAt: now,
                    }
                  : null
              )
              .filter(Boolean) as Prisma.ContactCreateManyInput[];

            if (contactData.length > 0) {
              await db.contact.createMany({ data: contactData });
            }

            // Activities
            await db.activity.createMany({
              data: leadData.map((l) => ({
                id: randomUUID(),
                type: "LEAD_IMPORTED" as const,
                actorId: session.user.id,
                leadId: l.id,
                metadata: JSON.stringify({ action: "created" }),
              })),
            });

            created += newRows.length;
          }

          // ── EXISTING LEADS: parallel updates ────────────────────────────
          if (existingRows.length > 0) {
            // Update lead data in parallel
            await Promise.all(
              existingRows.map(({ row, lead }) =>
                db.lead.update({
                  where: { id: lead.id },
                  data: {
                    companyName: row.companyName.trim(),
                    website: row.website?.trim() || lead.website,
                  },
                })
              )
            );

            // Handle contacts: update existing match, create new ones
            const contactCreates: Prisma.ContactCreateManyInput[] = [];
            const contactUpdates: Promise<unknown>[] = [];
            const now = new Date();

            for (const { row, lead } of existingRows) {
              if (!row.contactName?.trim()) continue;

              const match = lead.contacts.find(
                (c) =>
                  (row.email && c.email === row.email.trim()) ||
                  (row.directPhone && c.directPhone === row.directPhone.trim())
              );

              if (match) {
                contactUpdates.push(
                  db.contact.update({
                    where: { id: match.id },
                    data: {
                      name: row.contactName.trim(),
                      role: row.contactRole?.trim() || null,
                      directPhone: row.directPhone?.trim() || null,
                      switchboard: row.switchboard?.trim() || null,
                      email: row.email?.trim() || null,
                      linkedin: row.linkedin?.trim() || null,
                    },
                  })
                );
              } else {
                contactCreates.push({
                  id: randomUUID(),
                  leadId: lead.id,
                  name: row.contactName.trim(),
                  role: row.contactRole?.trim() || null,
                  directPhone: row.directPhone?.trim() || null,
                  switchboard: row.switchboard?.trim() || null,
                  email: row.email?.trim() || null,
                  linkedin: row.linkedin?.trim() || null,
                  createdAt: now,
                  updatedAt: now,
                });
              }
            }

            await Promise.all([
              ...contactUpdates,
              contactCreates.length > 0
                ? db.contact.createMany({ data: contactCreates })
                : Promise.resolve(),
            ]);

            // Activities in bulk
            await db.activity.createMany({
              data: existingRows.map(({ lead }) => ({
                id: randomUUID(),
                type: "LEAD_IMPORTED" as const,
                actorId: session.user.id,
                leadId: lead.id,
                metadata: JSON.stringify({ action: "updated" }),
              })),
            });

            updated += existingRows.length;
          }

          // Stream progress after each batch
          const done = Math.min(i + BATCH_SIZE, total);
          enqueue({ total, created, updated, skipped, done, errors: errors.slice(0, 10) });
        }

        enqueue({ complete: true, total, created, updated, skipped, errors });
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sse({ error: err instanceof Error ? err.message : "Import misslyckades" })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
