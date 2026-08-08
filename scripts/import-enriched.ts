/**
 * Import av en färdigberikad leadfil.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types \
 *     scripts/import-enriched.ts <fil.csv> --list "Namn" [--dry-run]
 *
 * Finns för att gränssnittets import kräver en inloggad admin-session och
 * därför inte går att köra från ett skal. Den återanvänder samma moduler som
 * `/api/import-stream` — `toE164`, `resolveIndustry`, `signalsFromImport`,
 * `writeImportedClaims` — i stället för att skriva om reglerna. Att ha två
 * uppsättningar importregler där bara den ena underhålls är den fälla
 * ARBETSLOGG varnar för, och en kopia av logiken hade varit precis det.
 *
 * FÖRUTSÄTTNING: filen får bara innehålla bolag som INTE finns i databasen.
 * Skriptet skapar, det slår aldrig ihop. Kör filtreringen först — importen
 * deduplicerar på org-nummer och 44 % av raderna saknar sådant, så en ofiltrerad
 * fil ger dubbletter av allt som bara matchar på namn.
 *
 * Kostar inga krediter: alla uppgifter kommer ur filen, inget externt anropas.
 */

import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config({ path: new URL("../.env.local", import.meta.url).pathname });

// Dynamiska importer: db.ts bygger sin klient vid modulinladdning och måste
// därför få se miljövariablerna först. Statiska importer hissas ovanför
// config() och hade gett en klient utan uppkoppling.
const { db } = await import("../src/lib/db.ts");
const { toE164 } = await import("../src/lib/phone.ts");
const { resolveIndustry } = await import("../src/lib/sni.ts");
const { parseNumeric } = await import("../src/lib/csv-parser.ts");
const { signalsFromImport, writeImportedClaims, hasSeoData } = await import(
  "../src/lib/enrichment/import-claims.ts"
);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const listNameArg = args[args.indexOf("--list") + 1];
const OWNER_ID = "cmnkj20etBo0ei_ae0hGuOlKWqoIG"; // zen@clicknet.se

if (!file) {
  console.error("Ange en fil. --dry-run för att räkna utan att skriva.");
  process.exit(1);
}

// ─── Läs filen ───────────────────────────────────────────────────────────────
const raw = readFileSync(file, "utf8").replace(/^﻿/, "");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const headers = lines[0].split(";").map((h) => h.trim());
const rows = lines.slice(1).map((line) => {
  const v = line.split(";");
  const o: Record<string, string> = {};
  headers.forEach((h, i) => (o[h] = (v[i] ?? "").trim()));
  return o;
});

console.log(`${rows.length} rader ur ${file}`);

// ─── Gruppera per bolag ──────────────────────────────────────────────────────
// Samma regel som import-stream: org-nummer är UNIQUE, så två rader med samma
// nummer måste bli ett lead. Rader utan org-nummer kan inte slås ihop säkert
// (två bolag kan heta lika) och får varsin grupp.
type Group = {
  id: string;
  companyName: string;
  orgNumber: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  industry: string | null;
  industryCode: string | null;
  employees: number | null;
  phone: string | null;
  phoneType: string | null;
  email: string | null;
  seo: Record<string, unknown>;
};

const clean = (v: string | undefined) => (v?.trim() ? v.trim() : null);
const byOrg = new Map<string, Group>();
const withoutOrg: Group[] = [];
let skipped = 0;

for (const r of rows) {
  const companyName = clean(r.foretag);
  if (!companyName) {
    skipped++;
    continue;
  }
  const orgNumber = clean(r.orgnr);
  const group: Group = {
    id: randomUUID(),
    companyName,
    orgNumber,
    website: clean(r.hemsida),
    address: clean(r.adress),
    city: clean(r.kommun),
    industry: resolveIndustry(clean(r.bransch) ?? undefined, clean(r.sni_kod) ?? undefined),
    industryCode: clean(r.sni_kod),
    // "1-4" och "5-9" är intervall, inte tal. parseNumeric ger null för dem,
    // vilket är rätt: "vet ej" och noll anställda är olika saker.
    employees: parseNumeric(r.antal_anstallda),
    phone: clean(r.telefon),
    phoneType: clean(r.nummertyp),
    email: clean(r.extra_mail),
    seo: {
      seoRank: clean(r.google_position) ?? undefined,
      seoKeyword: clean(r.sokord) ?? undefined,
      seoTop3: clean(r.topp3_pa_sokordet) ?? undefined,
      seoRivals: parseNumeric(r.antal_konkurrenter),
      gmbRating: parseNumeric(r.betyg),
      gmbReviews: parseNumeric(r.recensioner),
      gmbCategory: clean(r.kategori) ?? undefined,
    },
  };

  if (!orgNumber) {
    withoutOrg.push(group);
  } else if (!byOrg.has(orgNumber)) {
    byOrg.set(orgNumber, group);
  }
  // Dubblett inom filen på samma org-nummer: första raden vinner.
}

const groups = [...Array.from(byOrg.values()), ...withoutOrg];
const merged = rows.length - skipped - groups.length;

console.log(`  utan bolagsnamn, hoppas över: ${skipped}`);
console.log(`  slogs ihop inom filen:        ${merged}`);
console.log(`  bolag att skapa:              ${groups.length}`);
console.log(`  varav med telefon:            ${groups.filter((g) => g.phone).length}`);
console.log(`  varav med SEO-uppgifter:      ${groups.filter((g) => hasSeoData(g.seo)).length}`);

// ─── Säkerhetskontroll ───────────────────────────────────────────────────────
// Skriptet skapar bara. Krockar ett org-nummer med ett befintligt lead är
// filen inte filtrerad, och då ska vi stanna innan vi gör dubbletter.
const orgNumbers = groups.map((g) => g.orgNumber).filter((o): o is string => o !== null);
const collisions =
  orgNumbers.length > 0
    ? await db.lead.count({ where: { orgNumber: { in: orgNumbers } } })
    : 0;
if (collisions > 0) {
  console.error(
    `\nAVBRYTER: ${collisions} org-nummer finns redan i databasen. ` +
      `Filen är inte filtrerad — kör filtreringen först.`
  );
  process.exit(1);
}
console.log(`  krockar med befintliga:       0  ✓`);

if (dryRun) {
  console.log("\n--dry-run: ingenting skrevs.");
  process.exit(0);
}

// ─── Skriv ───────────────────────────────────────────────────────────────────
const listName = (listNameArg && !listNameArg.startsWith("--") ? listNameArg : null)
  ?? `Import ${new Date().toISOString().slice(0, 10)}`;

const list = await db.callList.create({
  data: { id: randomUUID(), name: listName.slice(0, 120), sourceFile: file, createdById: OWNER_ID },
});
console.log(`\nLista: "${list.name}"  ${list.id}`);

const BATCH = 400;
let created = 0;
let claimsWritten = 0;

for (let i = 0; i < groups.length; i += BATCH) {
  const batch = groups.slice(i, i + BATCH);
  const now = new Date();

  await db.lead.createMany({
    data: batch.map((g) => ({
      id: g.id,
      companyName: g.companyName,
      orgNumber: g.orgNumber,
      website: g.website,
      address: g.address,
      city: g.city,
      industry: g.industry,
      industryCode: g.industryCode,
      // Filens egen uppgift. Klassificeraren rör bara leads utan bransch och
      // skriver därför aldrig över den här.
      industrySource: g.industry ? "import" : null,
      employees: g.employees,
      ownerId: OWNER_ID,
      createdAt: now,
      updatedAt: now,
    })),
  });

  // Kontakten bär numret, och utan kontakt går leadet inte att ringa —
  // cockpiten renderar ringknapparna på kontaktens E164-fält.
  //
  // Filen har inget personnamn, bara bolagets nummer. Den förra importen
  // pekade "Kontaktnamn" på nummertyp-kolumnen, så varje kontakt i databasen
  // heter idag "Mobil" eller "Fast". Här sätts bolagsnamnet som namn och
  // nummertypen som roll — samma information, läsbar på skärmen.
  const contacts = batch
    .filter((g) => g.phone || g.email)
    .map((g) => ({
      id: randomUUID(),
      leadId: g.id,
      name: g.companyName.slice(0, 120),
      role: g.phoneType,
      // Mobilnummer ringer man direkt; ett fast nummer är i praktiken en växel.
      directPhone: g.phoneType === "Mobil" ? g.phone : null,
      switchboard: g.phoneType === "Mobil" ? null : g.phone,
      directPhoneE164: g.phoneType === "Mobil" ? toE164(g.phone) : null,
      switchboardE164: g.phoneType === "Mobil" ? null : toE164(g.phone),
      email: g.email,
      createdAt: now,
      updatedAt: now,
    }));
  if (contacts.length > 0) await db.contact.createMany({ data: contacts });

  await db.leadOnList.createMany({
    data: batch.map((g) => ({ listId: list.id, leadId: g.id, createdByImport: true })),
  });

  await db.activity.createMany({
    data: batch.map((g) => ({
      id: randomUUID(),
      type: "LEAD_IMPORTED" as const,
      actorId: OWNER_ID,
      leadId: g.id,
      metadata: JSON.stringify({ action: "created", source: "import-enriched.ts" }),
    })),
  });

  const seoWrites = batch
    .filter((g) => hasSeoData(g.seo))
    .map((g) => ({ leadId: g.id, signals: signalsFromImport(g.seo) }));
  if (seoWrites.length > 0) {
    const res = await writeImportedClaims(seoWrites);
    claimsWritten += res.written;
  }

  created += batch.length;
  console.log(`   ${created}/${groups.length}  (${claimsWritten} SEO-uppgifter)`);
}

console.log(`\nKLART`);
console.log(`  ${created} leads skapade`);
console.log(`  ${claimsWritten} SEO-uppgifter skrivna`);
console.log(`  lista: ${list.name}`);
