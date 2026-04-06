import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for Vercel Pro

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

const BATCH_SIZE = 50;

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
      const enqueue = (data: object) => controller.enqueue(encoder.encode(sse(data)));

      try {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];
        const total = rows.filter((r) => r.companyName?.trim()).length;

        enqueue({ total, created: 0, updated: 0, skipped: 0, done: 0 });

        // Process in batches to avoid timeout
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);

          for (const row of batch) {
            if (!row.companyName?.trim()) { skipped++; continue; }

            try {
              const orgNumber = row.orgNumber?.trim() || null;
              const existing = orgNumber
                ? await db.lead.findUnique({ where: { orgNumber } })
                : null;

              if (existing) {
                await db.lead.update({
                  where: { id: existing.id },
                  data: {
                    companyName: row.companyName.trim(),
                    website: row.website?.trim() || existing.website,
                  },
                });

                if (row.contactName?.trim()) {
                  const existingContact = await db.contact.findFirst({
                    where: {
                      leadId: existing.id,
                      OR: [
                        ...(row.email       ? [{ email:       row.email.trim()       }] : []),
                        ...(row.directPhone ? [{ directPhone: row.directPhone.trim() }] : []),
                      ],
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
                  data: { type: "LEAD_IMPORTED", actorId: session.user.id, leadId: existing.id, metadata: JSON.stringify({ action: "updated" }) },
                });
                updated++;
              } else {
                await db.lead.create({
                  data: {
                    companyName: row.companyName.trim(),
                    orgNumber,
                    website: row.website?.trim() || null,
                    ownerId: session.user.id,
                    contacts: row.contactName?.trim() ? {
                      create: {
                        name: row.contactName.trim(),
                        role: row.contactRole?.trim() || null,
                        directPhone: row.directPhone?.trim() || null,
                        switchboard: row.switchboard?.trim() || null,
                        email: row.email?.trim() || null,
                        linkedin: row.linkedin?.trim() || null,
                      },
                    } : undefined,
                    activities: {
                      create: { type: "LEAD_IMPORTED", actorId: session.user.id, metadata: JSON.stringify({ action: "created" }) },
                    },
                  },
                });
                created++;
              }
            } catch (err) {
              errors.push(`${row.companyName}: ${err instanceof Error ? err.message : "Okänt fel"}`);
            }
          }

          // Stream progress after each batch
          enqueue({ total, created, updated, skipped, done: Math.min(i + BATCH_SIZE, rows.length), errors: errors.slice(0, 10) });
        }

        enqueue({ complete: true, total, created, updated, skipped, errors });
      } catch (err) {
        controller.enqueue(encoder.encode(sse({ error: err instanceof Error ? err.message : "Import misslyckades" })));
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
