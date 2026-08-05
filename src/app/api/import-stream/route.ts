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

type ContactDraft = {
  name: string;
  role: string | null;
  directPhone: string | null;
  switchboard: string | null;
  email: string | null;
  linkedin: string | null;
};

/** Ett bolag = ett lead, oavsett hur många rader i filen som pekar på det. */
type CompanyGroup = {
  orgNumber: string | null;
  companyName: string;
  website: string | null;
  contacts: ContactDraft[];
};

const BATCH_SIZE = 500;

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const clean = (v?: string) => v?.trim() || null;

/**
 * Slår ihop rader som hör till samma bolag.
 *
 * Företagsexporter har typiskt en rad per beslutsfattare, så samma
 * organisationsnummer återkommer flera gånger. Lead.orgNumber är UNIQUE —
 * skickas dubbletterna vidare kraschar hela importen på en UNIQUE-krock.
 * Här blir de i stället ett lead med flera kontakter.
 *
 * Rader utan org-nummer kan inte slås ihop säkert (två bolag kan heta lika)
 * och får därför varsin grupp.
 */
function groupByCompany(rows: ImportRow[]): CompanyGroup[] {
  const byOrg = new Map<string, CompanyGroup>();
  const withoutOrg: CompanyGroup[] = [];

  for (const row of rows) {
    const companyName = row.companyName?.trim();
    if (!companyName) continue;

    const orgNumber = clean(row.orgNumber);
    const contactName = clean(row.contactName);

    const contact: ContactDraft | null = contactName
      ? {
          name: contactName,
          role: clean(row.contactRole),
          directPhone: clean(row.directPhone),
          switchboard: clean(row.switchboard),
          email: clean(row.email),
          linkedin: clean(row.linkedin),
        }
      : null;

    if (!orgNumber) {
      withoutOrg.push({
        orgNumber: null,
        companyName,
        website: clean(row.website),
        contacts: contact ? [contact] : [],
      });
      continue;
    }

    const existing = byOrg.get(orgNumber);
    if (existing) {
      // Senare rader fyller i luckor men skriver inte över det vi redan har
      existing.website ??= clean(row.website);
      if (contact && !hasContact(existing.contacts, contact)) {
        existing.contacts.push(contact);
      }
    } else {
      byOrg.set(orgNumber, {
        orgNumber,
        companyName,
        website: clean(row.website),
        contacts: contact ? [contact] : [],
      });
    }
  }

  // Array.from i stället för spread — tsconfig siktar på ES5 och kan inte
  // iterera en Map direkt
  return [...Array.from(byOrg.values()), ...withoutOrg];
}

/** Samma person två gånger i filen ska inte bli två kontakter. */
function hasContact(list: ContactDraft[], c: ContactDraft): boolean {
  return list.some(
    (x) =>
      (c.email && x.email === c.email) ||
      (c.directPhone && x.directPhone === c.directPhone) ||
      (!c.email && !c.directPhone && x.name === c.name)
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Bara admin laddar upp listor och bestämmer vem som ska jobba på dem
  if (session.user.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const {
    rows,
    listName,
    sourceFile,
    assigneeIds = [],
  }: {
    rows: ImportRow[];
    listName?: string;
    sourceFile?: string;
    assigneeIds?: string[];
  } = await req.json();

  const encoder = new TextEncoder();
  const userId = session.user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(encoder.encode(sse(data)));

      try {
        // ── Slå ihop rader per bolag ─────────────────────────────────────────
        const groups = groupByCompany(rows);

        // Rader utan bolagsnamn hoppas över; rader som delar org-nummer med en
        // tidigare rad slås ihop. Två olika saker — håll dem isär i statistiken.
        const skipped = rows.filter((r) => !r.companyName?.trim()).length;
        const merged = rows.length - skipped - groups.length;

        const total = groups.length;
        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        enqueue({ total, created: 0, updated: 0, skipped, merged, done: 0 });

        if (total === 0) {
          enqueue({
            complete: true, total, created, updated, skipped, merged,
            errors: ["Filen innehöll inga rader med bolagsnamn"], listId: null,
          });
          controller.close();
          return;
        }

        // ── Skapa mappen som importen hamnar i ───────────────────────────────
        const list = await db.callList.create({
          data: {
            id: randomUUID(),
            name: (listName?.trim() || sourceFile?.trim() || "Ny lista").slice(0, 120),
            sourceFile: sourceFile?.trim() || null,
            createdById: userId,
            access: {
              create: Array.from(new Set(assigneeIds)).map((uid) => ({ userId: uid })),
            },
          },
        });

        /**
         * Länkar leads till mappen. Ett lead kan ligga i flera mappar, så vi
         * filtrerar bara bort dubbletter inom SAMMA mapp (SQLite stödjer inte
         * skipDuplicates i createMany).
         */
        const linkToList = async (leadIds: string[]) => {
          if (leadIds.length === 0) return;
          const already = await db.leadOnList.findMany({
            where: { listId: list.id, leadId: { in: leadIds } },
            select: { leadId: true },
          });
          const existing = new Set(already.map((a) => a.leadId));
          const fresh = Array.from(new Set(leadIds)).filter((id) => !existing.has(id));
          if (fresh.length === 0) return;
          await db.leadOnList.createMany({
            data: fresh.map((leadId) => ({ listId: list.id, leadId })),
          });
        };

        // ── Hämta befintliga leads för alla org-nummer i ett svep ────────────
        const allOrgNumbers = groups
          .map((g) => g.orgNumber)
          .filter((o): o is string => o !== null);

        const existingLeads =
          allOrgNumbers.length > 0
            ? await db.lead.findMany({
                where: { orgNumber: { in: allOrgNumbers } },
                select: {
                  id: true,
                  orgNumber: true,
                  website: true,
                  contacts: { select: { id: true, name: true, email: true, directPhone: true } },
                },
              })
            : [];

        type ExistingLead = (typeof existingLeads)[number];
        const existingByOrg = new Map(existingLeads.map((l) => [l.orgNumber!, l]));

        // ── Batchvis bearbetning ─────────────────────────────────────────────
        for (let i = 0; i < groups.length; i += BATCH_SIZE) {
          const batch = groups.slice(i, i + BATCH_SIZE);

          const newGroups: CompanyGroup[] = [];
          const existingGroups: { group: CompanyGroup; lead: ExistingLead }[] = [];

          for (const group of batch) {
            const found = group.orgNumber ? existingByOrg.get(group.orgNumber) : undefined;
            if (found) existingGroups.push({ group, lead: found });
            else newGroups.push(group);
          }

          try {
            // ── NYA LEADS ───────────────────────────────────────────────────
            if (newGroups.length > 0) {
              const now = new Date();

              const leadData = newGroups.map((g) => ({
                id: randomUUID(),
                companyName: g.companyName,
                orgNumber: g.orgNumber,
                website: g.website,
                ownerId: userId,
                createdAt: now,
                updatedAt: now,
              }));

              await db.lead.createMany({ data: leadData });

              const contactData: Prisma.ContactCreateManyInput[] = [];
              newGroups.forEach((g, idx) => {
                for (const c of g.contacts) {
                  contactData.push({
                    id: randomUUID(),
                    leadId: leadData[idx].id,
                    name: c.name,
                    role: c.role,
                    directPhone: c.directPhone,
                    switchboard: c.switchboard,
                    email: c.email,
                    linkedin: c.linkedin,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
              });

              if (contactData.length > 0) {
                await db.contact.createMany({ data: contactData });
              }

              await db.activity.createMany({
                data: leadData.map((l) => ({
                  id: randomUUID(),
                  type: "LEAD_IMPORTED" as const,
                  actorId: userId,
                  leadId: l.id,
                  metadata: JSON.stringify({ action: "created" }),
                })),
              });

              await linkToList(leadData.map((l) => l.id));

              // Kommande batchar måste se de här som befintliga, annars
              // försöker vi skapa samma org-nummer igen
              newGroups.forEach((g, idx) => {
                if (!g.orgNumber) return;
                existingByOrg.set(g.orgNumber, {
                  id: leadData[idx].id,
                  orgNumber: g.orgNumber,
                  website: g.website,
                  contacts: g.contacts.map((c) => ({
                    id: "",
                    name: c.name,
                    email: c.email,
                    directPhone: c.directPhone,
                  })),
                });
              });

              created += newGroups.length;
            }

            // ── BEFINTLIGA LEADS ────────────────────────────────────────────
            if (existingGroups.length > 0) {
              const now = new Date();

              await Promise.all(
                existingGroups.map(({ group, lead }) =>
                  db.lead.update({
                    where: { id: lead.id },
                    data: {
                      companyName: group.companyName,
                      website: group.website ?? lead.website,
                    },
                  })
                )
              );

              // Bara kontakter som inte redan finns på leadet
              const contactCreates: Prisma.ContactCreateManyInput[] = [];
              for (const { group, lead } of existingGroups) {
                for (const c of group.contacts) {
                  const match = lead.contacts.find(
                    (x) =>
                      (c.email && x.email === c.email) ||
                      (c.directPhone && x.directPhone === c.directPhone)
                  );
                  if (match) continue;
                  contactCreates.push({
                    id: randomUUID(),
                    leadId: lead.id,
                    name: c.name,
                    role: c.role,
                    directPhone: c.directPhone,
                    switchboard: c.switchboard,
                    email: c.email,
                    linkedin: c.linkedin,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
              }

              if (contactCreates.length > 0) {
                await db.contact.createMany({ data: contactCreates });
              }

              await db.activity.createMany({
                data: existingGroups.map(({ lead }) => ({
                  id: randomUUID(),
                  type: "LEAD_IMPORTED" as const,
                  actorId: userId,
                  leadId: lead.id,
                  metadata: JSON.stringify({ action: "updated" }),
                })),
              });

              await linkToList(existingGroups.map(({ lead }) => lead.id));

              updated += existingGroups.length;
            }
          } catch (batchErr) {
            // En trasig batch ska inte döda hela importen — logga och fortsätt
            errors.push(
              `Rad ${i + 1}–${i + batch.length}: ${
                batchErr instanceof Error ? batchErr.message : "okänt fel"
              }`
            );
          }

          const done = Math.min(i + BATCH_SIZE, total);
          enqueue({ total, created, updated, skipped, merged, done, errors: errors.slice(0, 10) });
        }

        enqueue({
          complete: true, total, created, updated, skipped, merged, errors,
          listId: list.id, listName: list.name,
        });
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
