"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { visibleLeadWhere, canAccessList, ensurePersonalList, PERSONAL_LIST_NAME } from "@/lib/lists";
import { orgNyckel, namnOrtNyckel } from "@/lib/lead-identitet";
import { toE164 } from "@/lib/phone";
import { LEADS_PAGE_SIZE } from "@/lib/constants";
import type { Prisma } from "@/generated/prisma/client";

export type LeadWithMeta = Awaited<ReturnType<typeof getLeads>>[number];
export type LeadDetail = Awaited<ReturnType<typeof getLead>>;

// ── Queries ────────────────────────────────────────────────────────────────

export async function getLeads(filters?: {
  search?: string;
  ownerId?: string;
  includeWithDeals?: boolean; // default false — hides leads with active deals
  take?: number;
}) {
  const user = await requireAuth();

  // AND-lista i stället för ett platt objekt: både synligheten och sökningen
  // behöver varsitt OR, och de får inte skriva över varandra.
  const and: Prisma.LeadWhereInput[] = [
    // Säljare ser sina egna leads + allt i mappar de har tillgång till.
    // Admin ser allt (visibleLeadWhere returnerar tomt filter).
    visibleLeadWhere(user),
  ];

  if (user.role === "ADMIN" && filters?.ownerId) {
    and.push({ ownerId: filters.ownerId });
  }

  // Bolag som blivit kunder göms här — de bor i /deals nu och ska inte ringas.
  if (!filters?.includeWithDeals) {
    and.push({ hasActiveDeal: false });
  }

  if (filters?.search) {
    and.push({
      OR: [
        { companyName: { contains: filters.search } },
        { orgNumber: { contains: filters.search } },
      ],
    });
  }

  return db.lead.findMany({
    where: { AND: and },
    orderBy: { updatedAt: "desc" },
    take: filters?.take ?? LEADS_PAGE_SIZE,
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { contacts: true, deals: true } },
      activities: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true, type: true },
      },
    },
  });
}

/** Hur många leads som matchar filtret totalt — driver "visar X av Y". */
export async function countLeads(filters?: {
  search?: string;
  ownerId?: string;
  includeWithDeals?: boolean;
}) {
  const user = await requireAuth();

  const and: Prisma.LeadWhereInput[] = [visibleLeadWhere(user)];

  if (user.role === "ADMIN" && filters?.ownerId) {
    and.push({ ownerId: filters.ownerId });
  }
  if (!filters?.includeWithDeals) {
    and.push({ hasActiveDeal: false });
  }
  if (filters?.search) {
    and.push({
      OR: [
        { companyName: { contains: filters.search } },
        { orgNumber: { contains: filters.search } },
      ],
    });
  }

  return db.lead.count({ where: { AND: and } });
}

export async function getLead(id: string) {
  const user = await requireAuth();

  const lead = await db.lead.findFirst({
    // Åtkomst: eget lead eller lead i en mapp man är tilldelad
    where: { AND: [{ id }, visibleLeadWhere(user)] },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      deals: {
        orderBy: { closedAt: "desc" },
        include: {
          products: { include: { product: true } },
        },
      },
      activities: {
        orderBy: { timestamp: "desc" },
        take: 50,
        include: {
          actor: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
        },
      },
      tags: { include: { tag: true } },
      dnc: true,
      // Mappen bolaget ligger i — en enda sedan 031. Bolagssidan behöver den
      // för att kunna erbjuda "Dela" när mappen är säljarens egen.
      lists: { select: { list: { select: { id: true, name: true, personalForId: true } } } },
    },
  });

  if (!lead) return null;

  // Spärren kan hänga på org-numret i stället för på leadet — så ser den ut
  // efter en omimport, eftersom `leadId` nollas när den gamla raden raderas.
  // Däcket matchar på båda; den här vyn måste göra det också, annars påstår
  // den att ett bolag är ringbart som rotationen vägrar servera.
  if (!lead.dnc && lead.orgNumber) {
    const byOrg = await db.doNotCall.findFirst({
      where: {
        orgNumber: lead.orgNumber,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (byOrg) return { ...lead, dnc: byOrg };
  }

  return lead;
}

/**
 * Lyfter en spärr och släpper tillbaka bolaget i rotationen.
 *
 * Vägen tillbaka från `BORTFALL`. Den knappen är ett tangenttryck mitt i ett
 * samtal och kommer att tryckas fel — utan den här funktionen vore ett
 * feltryck en dörr som bara går åt ena hållet.
 *
 * **Admin-bara.** Spärren finns för att skydda kunden från oss; att lyfta den
 * är ett beslut om att börja ringa någon som bett oss låta bli, och det ska
 * inte ligga på samma person som råkade sätta den.
 *
 * Både spärrlistan och pensioneringen släpps — bara den ena hade lämnat
 * bolaget stoppat ändå, på det andra villkoret, och gett ett gränssnitt som
 * påstår att något hänt när ingenting hänt. `nextActionAt` sätts INTE:
 * `rotationResumeAt` gäller fortfarande, och ett bolag som sagt nej ska inte
 * bli ringbart i förtid av att en spärr lyfts.
 */
export async function liftDoNotCall(leadId: string) {
  const user = await requireAdmin();

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { orgNumber: true, retiredReason: true },
  });
  if (!lead) throw new Error("Bolaget finns inte");

  await db.doNotCall.deleteMany({
    where: {
      OR: [
        { leadId },
        ...(lead.orgNumber ? [{ orgNumber: lead.orgNumber }] : []),
      ],
    },
  });

  // Bara spärrar vi själva satt. Ett bolag som pensionerats för att numret var
  // fel blir inte ringbart av att spärren lyfts — numret är fortfarande fel.
  if (lead.retiredReason === "bortfall" || lead.retiredReason === "inget_nummer") {
    await db.lead.update({
      where: { id: leadId },
      data: { retired: false, retiredReason: null },
    });
  }

  await db.activity.create({
    data: {
      type: "STATUS_CHANGE",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({ status: "unblocked", reason: "spärr lyft" }),
    },
  });

  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}

// ── Mutations ──────────────────────────────────────────────────────────────

export type NyttLead = {
  companyName: string;
  orgNumber?: string;
  website?: string;
  address?: string;
  city?: string;
  industry?: string;
  contact: {
    name?: string;
    role?: string;
    directPhone?: string;
    switchboard?: string;
    email?: string;
    linkedin?: string;
  };
  note?: string;
  /** "Dela till alla" = en ringlista, "Behåll till mig" = säljarens egen mapp. */
  target: { kind: "list"; listId: string } | { kind: "mine" };
};

export type NyttLeadSvar =
  | { ok: true; leadId: string; listId: string; listName: string; personal: boolean }
  /** Bolaget finns redan. `leadId` bara om användaren får öppna det. */
  | { ok: false; finns: { leadId: string | null; companyName: string; listName: string | null } }
  | { ok: false; fel: string };

/**
 * Ett bolag inlagt för hand — tipset, kunden som ringde in, bolaget säljaren
 * hittade själv.
 *
 * Bolaget hamnar alltid i EN mapp, aldrig mapplöst: cockpiten ringer mappar,
 * och ett bolag utanför dem serveras aldrig av rotationen. "Behåll till mig"
 * är därför också en mapp — säljarens egen, se `ensurePersonalList`.
 *
 * **Dubbletter skapas inte, och befintliga bolag flyttas inte.** Identiteten är
 * importens (`orgNyckel`, sedan namn+ort med exakt en träff). Finns bolaget
 * svarar funktionen med var det ligger i stället för att röra det: ett bolag i
 * en kollegas ringlista ska inte kunna dras in i någons egen mapp av att hen
 * skrev in det en gång till.
 *
 * Svaret är ett värde, inte ett kast, för att formuläret ska kunna visa *vilket*
 * bolag det krockade med och länka dit.
 */
export async function createLead(data: NyttLead): Promise<NyttLeadSvar> {
  const user = await requireAuth();

  const companyName = data.companyName.trim();
  if (!companyName) return { ok: false, fel: "Bolaget måste ha ett namn" };

  const orgRaw = data.orgNumber?.trim() || null;
  const orgNumber = orgNyckel(orgRaw);
  if (orgRaw && !orgNumber) return { ok: false, fel: "Org.nr ska ha tio siffror" };

  const directPhone = data.contact.directPhone?.trim() || null;
  const switchboard = data.contact.switchboard?.trim() || null;
  const directPhoneE164 = toE164(directPhone);
  const switchboardE164 = toE164(switchboard);
  // Ett nummer som inte går att tolka sparas inte som text heller: kortet hade
  // visat det, cockpiten hade inte kunnat ringa det — återvändsgränden
  // `createContact` normaliserar för att undvika.
  if (directPhone && !directPhoneE164) return { ok: false, fel: `Kan inte läsa numret ${directPhone}` };
  if (switchboard && !switchboardE164) return { ok: false, fel: `Kan inte läsa numret ${switchboard}` };
  if (!directPhoneE164 && !switchboardE164) {
    return { ok: false, fel: "Lägg till minst ett nummer — utan det går bolaget inte att ringa" };
  }

  const city = data.city?.trim() || null;

  // ── Finns bolaget redan? ──
  let befintligId: string | null = null;
  if (orgNumber) {
    const träff = await db.lead.findFirst({
      // Importen skriver nyckeln (tio siffror). Bindestrecksformen täcker rader
      // som kom in för hand före normaliseringen.
      where: { orgNumber: { in: [orgNumber, `${orgNumber.slice(0, 6)}-${orgNumber.slice(6)}`] } },
      select: { id: true },
    });
    befintligId = träff?.id ?? null;
  } else if (city) {
    const nyckel = namnOrtNyckel(companyName, city);
    const kandidater = await db.lead.findMany({
      where: { city: { equals: city, mode: "insensitive" } },
      select: { id: true, companyName: true, city: true },
    });
    const träffar = kandidater.filter((k) => namnOrtNyckel(k.companyName, k.city) === nyckel);
    if (träffar.length === 1) befintligId = träffar[0].id;
  }

  if (befintligId) {
    const synlig = await db.lead.findFirst({
      where: { AND: [{ id: befintligId }, visibleLeadWhere(user)] },
      select: {
        id: true,
        companyName: true,
        lists: { select: { list: { select: { name: true, personalForId: true } } }, take: 1 },
      },
    });
    const lista = synlig?.lists[0]?.list;
    return {
      ok: false,
      finns: {
        leadId: synlig?.id ?? null,
        companyName: synlig?.companyName ?? companyName,
        listName: lista ? (lista.personalForId === user.id ? PERSONAL_LIST_NAME : lista.name) : null,
      },
    };
  }

  // ── Spärrlistan ──
  // Kundens besked gäller även när bolaget kommer in för hand. Samma två
  // nycklar som däcket: org-numret och numret.
  const nummer = [directPhoneE164, switchboardE164].filter((n): n is string => !!n);
  const spärr = await db.doNotCall.findFirst({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        {
          OR: [
            ...(orgNumber ? [{ orgNumber }] : []),
            { phoneE164: { in: nummer } },
          ],
        },
      ],
    },
    select: { reason: true },
  });
  if (spärr) {
    return { ok: false, fel: `Står på spärrlistan${spärr.reason ? ` — ${spärr.reason}` : ""}. Be en admin om bolaget ska ringas.` };
  }

  // ── Vart bolaget ska ──
  let list: { id: string; name: string };
  if (data.target.kind === "mine") {
    list = await ensurePersonalList(user.id);
  } else {
    const vald = await db.callList.findFirst({
      where: { id: data.target.listId, archived: false },
      select: { id: true, name: true, personalForId: true },
    });
    // En annan säljares egen mapp går inte att lägga i, inte ens för admin —
    // det vore att dela ut ett bolag hemligt till någon.
    if (
      !vald ||
      !(await canAccessList(user, vald.id)) ||
      (vald.personalForId !== null && vald.personalForId !== user.id)
    ) {
      return { ok: false, fel: "Du har inte tillgång till den ringlistan" };
    }
    list = { id: vald.id, name: vald.name };
  }
  const personal = data.target.kind === "mine";

  const contactName = data.contact.name?.trim() || null;
  const note = data.note?.trim() || null;
  const industry = data.industry?.trim() || null;

  const lead = await db.lead.create({
    data: {
      companyName,
      orgNumber,
      website: data.website?.trim() || null,
      address: data.address?.trim() || null,
      city,
      industry,
      // En handsatt bransch skrivs aldrig över av klassificeringen.
      industrySource: industry ? "manual" : null,
      ownerId: user.id,
      contacts: {
        create: {
          // Kontakten bär numren, och `Contact.name` är obligatoriskt. Utan
          // namn är det växeln man ringer — då heter raden så.
          name: contactName ?? (directPhoneE164 ? "Kontakt" : "Växel"),
          role: data.contact.role?.trim() || null,
          directPhone,
          switchboard,
          directPhoneE164,
          switchboardE164,
          email: data.contact.email?.trim() || null,
          linkedin: data.contact.linkedin?.trim() || null,
        },
      },
      // `createdByImport: false` med flit. Raderas mappen — en felimport som
      // ångras — ska ett handinlagt tips inte följa med; det blir mapplöst men
      // finns kvar.
      lists: { create: { listId: list.id, createdByImport: false } },
      activities: {
        create: [
          {
            type: "LEAD_CREATED",
            actorId: user.id,
            metadata: JSON.stringify({ lista: personal ? PERSONAL_LIST_NAME : list.name, personal }),
          },
          ...(note
            ? [{ type: "NOTE" as const, actorId: user.id, metadata: JSON.stringify({ note }) }]
            : []),
        ],
      },
    },
    select: { id: true },
  });

  revalidatePath("/lists");
  revalidatePath(`/lists/${list.id}`);
  return { ok: true, leadId: lead.id, listId: list.id, listName: list.name, personal };
}

export async function updateLead(
  id: string,
  data: {
    companyName?: string;
    orgNumber?: string;
    website?: string;
    address?: string;
  }
) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "SELLER" && lead.ownerId !== user.id) throw new Error("Forbidden");

  const updated = await db.lead.update({ where: { id }, data });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return updated;
}

/**
 * Endast admin. Raderingen kaskaderar ner i kontakter, aktiviteter, möten och
 * affärer — aktivitetsloggen ska vara oföränderlig, så det här är den enda
 * vägen den kan försvinna. Den vägen får inte stå öppen för säljare.
 */
export async function deleteLead(id: string) {
  await requireAdmin();
  await db.lead.delete({ where: { id } });
  revalidatePath("/leads");
}

/** Endast admin — annars går claim-låset att kringgå genom att flytta leadet till sig själv. */
export async function reassignLead(id: string, newOwnerId: string) {
  const user = await requireAdmin();

  const lead = await db.lead.findUnique({
    where: { id },
    include: { owner: { select: { name: true } } },
  });
  if (!lead) throw new Error("Lead not found");

  const newOwner = await db.user.findUnique({ where: { id: newOwnerId } });
  if (!newOwner) throw new Error("User not found");

  await db.lead.update({ where: { id }, data: { ownerId: newOwnerId } });
  await db.activity.create({
    data: {
      type: "LEAD_ASSIGNED",
      actorId: user.id,
      leadId: id,
      metadata: JSON.stringify({ from: lead.owner.name, to: newOwner.name }),
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

/**
 * Snabbsökning över de leads användaren faktiskt har tillgång till.
 *
 * Driver sökfältet på Ringlistor, som numera är enda vägen in till ett enskilt
 * lead — lead-listan är borttagen ur menyn. Därför söker den bredare än
 * `getLeads`: en säljare som letar efter ett bolag minns lika ofta personens
 * namn eller de sista siffrorna i numret som firmanamnet.
 *
 * Skiljer sig från `getLeads` på tre punkter, alla medvetna:
 *
 *  - **`hasActiveDeal` filtreras inte bort.** Ett lead som blivit en affär ska
 *    gå att hitta; det är ofta då man letar efter det.
 *  - **Retirerade tas med.** "Varför ringer vi inte det här bolaget?" är en
 *    fråga sökningen ska kunna svara på, inte dölja.
 *  - **Liten `take`.** Det här är en snabbsökning i en dropdown, inte en
 *    tabell. Fler än tolv träffar betyder att man ska skriva mer, inte scrolla.
 */
export async function searchAssignedLeads(query: string) {
  const user = await requireAuth();

  const q = query.trim();
  // Två tecken är minimum. Ett tecken matchar halva databasen och kostar en
  // full tabellskanning för ett resultat ingen kan använda.
  if (q.length < 2) return [];

  // Siffror i ett telefonnummer skrivs på fem sätt. Normalisera bort allt utom
  // siffror så att "070-123 45 67" hittar "+46701234567" — E164-kolumnerna
  // lagrar bara siffror och plus.
  const digits = q.replace(/\D/g, "");
  const phoneQuery = digits.length >= 4 ? digits.replace(/^0/, "") : null;

  const or: Prisma.LeadWhereInput[] = [
    { companyName: { contains: q } },
    { orgNumber: { contains: q } },
    { city: { contains: q } },
    { contacts: { some: { name: { contains: q } } } },
  ];

  if (phoneQuery) {
    or.push(
      { contacts: { some: { directPhoneE164: { contains: phoneQuery } } } },
      { contacts: { some: { switchboardE164: { contains: phoneQuery } } } },
      { contacts: { some: { directPhone: { contains: digits } } } }
    );
  }

  const leads = await db.lead.findMany({
    where: { AND: [visibleLeadWhere(user), { OR: or }] },
    take: 12,
    // Senast rörda först: letar man efter ett bolag är det oftast ett man
    // nyligen haft att göra med.
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyName: true,
      city: true,
      industry: true,
      retired: true,
      retiredReason: true,
      hasActiveDeal: true,
      callbackAt: true,
      lastAttemptAt: true,
      contacts: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { name: true, directPhoneE164: true, directPhone: true },
      },
      lists: {
        take: 1,
        select: { list: { select: { id: true, name: true } } },
      },
    },
  });

  return leads.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    city: l.city,
    industry: l.industry,
    retired: l.retired,
    retiredReason: l.retiredReason,
    hasActiveDeal: l.hasActiveDeal,
    callbackAt: l.callbackAt,
    lastAttemptAt: l.lastAttemptAt,
    contactName: l.contacts[0]?.name ?? null,
    phone: l.contacts[0]?.directPhoneE164 ?? l.contacts[0]?.directPhone ?? null,
    listId: l.lists[0]?.list.id ?? null,
    listName: l.lists[0]?.list.name ?? null,
  }));
}

export type LeadSearchHit = Awaited<ReturnType<typeof searchAssignedLeads>>[number];
