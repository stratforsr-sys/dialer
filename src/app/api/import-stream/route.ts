import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth-options";
import { db } from "@/lib/db";
import { toE164 } from "@/lib/phone";
import { resolveIndustry } from "@/lib/sni";
import { parseImportDate } from "@/lib/import-date";
import {
  hasSeoData,
  signalsFromImport,
  writeImportedClaims,
  type ImportedSeo,
} from "@/lib/enrichment/import-claims";
import type { Signal } from "@/lib/enrichment/types";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  /** Råtext ur filen — tolkas här, inte i webbläsaren. */
  registeredAt?: string;
  contactName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactRole?: string;
  directPhone?: string;
  switchboard?: string;
  email?: string;
  linkedin?: string;
} & ImportedSeo;

type ContactDraft = {
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  directPhone: string | null;
  switchboard: string | null;
  /// Normaliserat här, vid importen. Cockpiten renderar ringknapparna på
  /// E164-fälten — lämnas de tomma har ett importerat nummer ingenstans att
  /// synas, oavsett att råtexten finns kvar i kolumnen bredvid.
  directPhoneE164: string | null;
  switchboardE164: string | null;
  email: string | null;
  linkedin: string | null;
};

/** Ett bolag = ett lead, oavsett hur många rader i filen som pekar på det. */
type CompanyGroup = {
  orgNumber: string | null;
  companyName: string;
  website: string | null;
  address: string | null;
  city: string | null;
  industry: string | null;
  industryCode: string | null;
  employees: number | null;
  revenue: number | null;
  registeredAt: Date | null;
  contacts: ContactDraft[];
  /**
   * SEO-uppgifterna från filen, obearbetade. Tolkas först vid skrivningen —
   * flera rader kan höra till samma bolag och den första ifyllda vinner, precis
   * som för adress och bransch.
   */
  seo: ImportedSeo;
};

/** Plockar ut SEO-fälten ur en rad. Tomma strängar blir undefined. */
function seoOf(row: ImportRow): ImportedSeo {
  return {
    seoRank: clean(row.seoRank) ?? undefined,
    seoKeyword: clean(row.seoKeyword) ?? undefined,
    seoCompetitor: clean(row.seoCompetitor) ?? undefined,
    seoTop3: clean(row.seoTop3) ?? undefined,
    seoRivals: num(row.seoRivals),
    seoServices: clean(row.seoServices) ?? undefined,
    gmbRating: num(row.gmbRating),
    gmbReviews: num(row.gmbReviews),
    gmbCategory: clean(row.gmbCategory) ?? undefined,
  };
}

/** Senare rader fyller luckor i det bolaget redan fått, aldrig tvärtom. */
function mergeSeo(into: ImportedSeo, from: ImportedSeo): void {
  into.seoRank ??= from.seoRank;
  into.seoKeyword ??= from.seoKeyword;
  into.seoCompetitor ??= from.seoCompetitor;
  into.seoTop3 ??= from.seoTop3;
  into.seoRivals ??= from.seoRivals;
  into.seoServices ??= from.seoServices;
  into.gmbRating ??= from.gmbRating;
  into.gmbReviews ??= from.gmbReviews;
  into.gmbCategory ??= from.gmbCategory;
}

const BATCH_SIZE = 500;

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const clean = (v?: string) => v?.trim() || null;

/**
 * Klienten skickar redan tolkade tal, men endpointen tar emot JSON utifrån och
 * får inte lita på det. Strängar och NaN ska bli NULL, inte en trasig rad —
 * "uppgiften saknas" är ett giltigt svar, en nolla är det inte.
 */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Anställda är ett heltal i schemat; ett decimaltal från filen avrundas. */
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

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
    const firstName = clean(row.contactFirstName);
    const lastName = clean(row.contactLastName);
    // Klienten sätter normalt ihop namnet, men endpointen tar emot JSON utifrån
    // och får inte lita på det: utan namn skapas ingen kontakt alls, och då
    // försvinner radens telefonnummer med den.
    const contactName =
      clean(row.contactName) ?? ([firstName, lastName].filter(Boolean).join(" ") || null);

    const directPhone = clean(row.directPhone);
    const switchboard = clean(row.switchboard);

    const contact: ContactDraft | null = contactName
      ? {
          name: contactName,
          firstName,
          lastName,
          role: clean(row.contactRole),
          directPhone,
          switchboard,
          directPhoneE164: toE164(directPhone),
          switchboardE164: toE164(switchboard),
          email: clean(row.email),
          linkedin: clean(row.linkedin),
        }
      : null;

    if (!orgNumber) {
      withoutOrg.push({
        orgNumber: null,
        companyName,
        website: clean(row.website),
        address: clean(row.address),
        city: clean(row.city),
        industry: resolveIndustry(row.industry, row.industryCode),
        industryCode: clean(row.industryCode),
        employees: int(row.employees),
        revenue: num(row.revenue),
        registeredAt: parseImportDate(row.registeredAt),
        contacts: contact ? [contact] : [],
        seo: seoOf(row),
      });
      continue;
    }

    const existing = byOrg.get(orgNumber);
    if (existing) {
      // Senare rader fyller i luckor men skriver inte över det vi redan har
      existing.website ??= clean(row.website);
      existing.address ??= clean(row.address);
      existing.city ??= clean(row.city);
      existing.industry ??= resolveIndustry(row.industry, row.industryCode);
      existing.industryCode ??= clean(row.industryCode);
      existing.employees ??= int(row.employees);
      existing.revenue ??= num(row.revenue);
      existing.registeredAt ??= parseImportDate(row.registeredAt);
      mergeSeo(existing.seo, seoOf(row));
      if (contact && !hasContact(existing.contacts, contact)) {
        existing.contacts.push(contact);
      }
    } else {
      byOrg.set(orgNumber, {
        orgNumber,
        companyName,
        website: clean(row.website),
        address: clean(row.address),
        city: clean(row.city),
        industry: resolveIndustry(row.industry, row.industryCode),
        industryCode: clean(row.industryCode),
        employees: int(row.employees),
        revenue: num(row.revenue),
        registeredAt: parseImportDate(row.registeredAt),
        contacts: contact ? [contact] : [],
        seo: seoOf(row),
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
        // SEO-uppgifter som skrevs, och sådana filen fick stå tillbaka för
        // eftersom en hämtning redan ägde nyckeln. Båda rapporteras — en
        // import där filens siffror tyst ignorerades ser annars ut att ha
        // fungerat.
        let seoClaims = 0;
        let seoKept = 0;
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
        /**
         * `createdByImport` säger om det var den här importen som skapade
         * leadet. Flaggan avgör vad som händer när mappen tas bort: leads som
         * importen skapade följer med, dubbletter som redan fanns blir kvar.
         * Den måste sättas här och nu — i efterhand går fallen inte att skilja.
         */
        const linkToList = async (leadIds: string[], createdByImport: boolean) => {
          if (leadIds.length === 0) return;
          const already = await db.leadOnList.findMany({
            where: { listId: list.id, leadId: { in: leadIds } },
            select: { leadId: true },
          });
          const existing = new Set(already.map((a) => a.leadId));
          const fresh = Array.from(new Set(leadIds)).filter((id) => !existing.has(id));
          if (fresh.length === 0) return;
          await db.leadOnList.createMany({
            data: fresh.map((leadId) => ({ listId: list.id, leadId, createdByImport })),
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
                  address: true,
                  city: true,
                  industry: true,
                  industryCode: true,
                  employees: true,
                  revenue: true,
                  registeredAt: true,
                  contacts: {
                    select: {
                      id: true, name: true, firstName: true, lastName: true, role: true,
                      email: true, directPhone: true, switchboard: true,
                      directPhoneE164: true, switchboardE164: true, linkedin: true,
                    },
                  },
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

          // SEO-uppgifterna samlas för hela batchen och skrivs i EN klump på
          // slutet. Per lead hade det blivit fyra rundturer mot Turso gånger
          // femhundra bolag — samma jobb, tvåtusen anrop, och cron-fönstret
          // slut långt innan filen är genomläst.
          const seoWrites: { leadId: string; signals: Signal[] }[] = [];

          try {
            // ── NYA LEADS ───────────────────────────────────────────────────
            if (newGroups.length > 0) {
              const now = new Date();

              const leadData = newGroups.map((g) => ({
                id: randomUUID(),
                companyName: g.companyName,
                orgNumber: g.orgNumber,
                website: g.website,
                address: g.address,
                city: g.city,
                industry: g.industry,
                industryCode: g.industryCode,
                // Filens egen uppgift. Klassificeraren rör bara leads utan
                // bransch, så den skriver aldrig över den här.
                industrySource: g.industry ? "import" : null,
                employees: g.employees,
                revenue: g.revenue,
                registeredAt: g.registeredAt,
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
                    firstName: c.firstName,
                    lastName: c.lastName,
                    role: c.role,
                    directPhone: c.directPhone,
                    switchboard: c.switchboard,
                    directPhoneE164: c.directPhoneE164,
                    switchboardE164: c.switchboardE164,
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

              // Skapade av den här importen — försvinner med mappen.
              await linkToList(leadData.map((l) => l.id), true);

              // Kommande batchar måste se de här som befintliga, annars
              // försöker vi skapa samma org-nummer igen
              newGroups.forEach((g, idx) => {
                if (!g.orgNumber) return;
                existingByOrg.set(g.orgNumber, {
                  id: leadData[idx].id,
                  orgNumber: g.orgNumber,
                  website: g.website,
                  address: g.address,
                  city: g.city,
                  industry: g.industry,
                  industryCode: g.industryCode,
                  employees: g.employees,
                  revenue: g.revenue,
                  registeredAt: g.registeredAt,
                  contacts: g.contacts.map((c) => ({
                    // id är tomt: raden skapades med createMany, som inte ger
                    // tillbaka id:n. Cachen används bara för dubblettkontroll
                    // i kommande batchar — en kontakt som just skapats i den
                    // här körningen har inga tomma fält att fylla i.
                    id: "",
                    name: c.name,
                    firstName: c.firstName,
                    lastName: c.lastName,
                    role: c.role,
                    email: c.email,
                    directPhone: c.directPhone,
                    switchboard: c.switchboard,
                    directPhoneE164: c.directPhoneE164,
                    switchboardE164: c.switchboardE164,
                    linkedin: c.linkedin,
                  })),
                });
              });

              newGroups.forEach((g, idx) => {
                if (hasSeoData(g.seo)) {
                  seoWrites.push({ leadId: leadData[idx].id, signals: signalsFromImport(g.seo) });
                }
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
                      address: group.address ?? lead.address,
                      city: group.city ?? lead.city,
                      industry: group.industry ?? lead.industry,
                      industryCode: group.industryCode ?? lead.industryCode,
                      industrySource: lead.industry ? undefined : (group.industry ? "import" : undefined),
                      employees: group.employees ?? lead.employees,
                      revenue: group.revenue ?? lead.revenue,
                      // Samma regel som raderna ovanför: filens uppgift vinner
                      // när den finns, annars står det som redan finns kvar.
                      // En tom cell ska aldrig radera ett datum som en tidigare
                      // import hämtade in.
                      registeredAt: group.registeredAt ?? lead.registeredAt,
                    },
                  })
                )
              );

              // Bara kontakter som inte redan finns på leadet. Den som redan
              // finns får i stället sina TOMMA fält ifyllda — annars kan en
              // omimport aldrig laga en kontakt som saknar förnamn eller växel,
              // och enda vägen tillbaka blir att radera och importera om.
              // Ifyllda värden rörs aldrig: filen ska komplettera det som
              // står i systemet, inte skriva över det någon rättat för hand.
              const contactCreates: Prisma.ContactCreateManyInput[] = [];
              const contactPatches: Array<{ id: string; data: Prisma.ContactUpdateInput }> = [];

              for (const { group, lead } of existingGroups) {
                for (const c of group.contacts) {
                  const match = lead.contacts.find(
                    (x) =>
                      (c.email && x.email === c.email) ||
                      (c.directPhone && x.directPhone === c.directPhone)
                  );
                  if (match) {
                    const patch: Prisma.ContactUpdateInput = {};
                    if (!match.firstName && c.firstName) patch.firstName = c.firstName;
                    if (!match.lastName && c.lastName) patch.lastName = c.lastName;
                    if (!match.role && c.role) patch.role = c.role;
                    if (!match.switchboard && c.switchboard) patch.switchboard = c.switchboard;
                    if (!match.switchboardE164 && c.switchboardE164) patch.switchboardE164 = c.switchboardE164;
                    if (!match.directPhoneE164 && c.directPhoneE164) patch.directPhoneE164 = c.directPhoneE164;
                    if (!match.email && c.email) patch.email = c.email;
                    if (!match.linkedin && c.linkedin) patch.linkedin = c.linkedin;
                    // Namnet lagas bara när filen har ett mer komplett namn —
                    // "Anders Svensson" ersätter "Svensson", aldrig tvärtom.
                    if (c.firstName && c.lastName && match.name.trim() !== `${c.firstName} ${c.lastName}`) {
                      if (match.name.trim().split(/\s+/).length < 2) {
                        patch.name = `${c.firstName} ${c.lastName}`;
                      }
                    }
                    // match.id === "" är en kontakt som skapades tidigare i den
                    // här körningen (createMany ger inga id:n tillbaka). Den
                    // går inte att uppdatera på id — hoppa hellre över än att
                    // krascha importen på en where-sats som inte träffar något.
                    if (match.id && Object.keys(patch).length > 0) {
                      contactPatches.push({ id: match.id, data: patch });
                    }
                    continue;
                  }
                  contactCreates.push({
                    id: randomUUID(),
                    leadId: lead.id,
                    name: c.name,
                    firstName: c.firstName,
                    lastName: c.lastName,
                    role: c.role,
                    directPhone: c.directPhone,
                    switchboard: c.switchboard,
                    directPhoneE164: c.directPhoneE164,
                    switchboardE164: c.switchboardE164,
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

              for (let p = 0; p < contactPatches.length; p += 100) {
                await Promise.all(
                  contactPatches.slice(p, p + 100).map(({ id, data }) =>
                    db.contact.update({ where: { id }, data })
                  )
                );
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

              // Fanns redan i dialern — dubbletter, stannar kvar när mappen tas bort.
              await linkToList(existingGroups.map(({ lead }) => lead.id), false);

              for (const { group, lead } of existingGroups) {
                if (hasSeoData(group.seo)) {
                  seoWrites.push({ leadId: lead.id, signals: signalsFromImport(group.seo) });
                }
              }

              updated += existingGroups.length;
            }

            if (seoWrites.length > 0) {
              const seoResult = await writeImportedClaims(seoWrites);
              seoClaims += seoResult.written;
              seoKept += seoResult.keptExisting;
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
          seoClaims, seoKept,
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
