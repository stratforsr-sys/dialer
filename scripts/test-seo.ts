/**
 * Verifiering av SEO-spåret.
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/test-seo.ts
 *
 * Det som måste hålla: en placering som inte finns får ALDRIG bli ett tal.
 * ">100" som blir 100 gör en icke-placering till en placering, och säljaren
 * säger då något som är kontrollerbart fel — det värsta utfallet i hela kedjan.
 *
 * Testdatan är kolumnnamn och värden hämtade ur en riktig export från
 * leadmotorn, inte påhittade exempel.
 */

// Modulerna drar in Prisma-klienten. Testet rör aldrig databasen, men klienten
// konstrueras vid import och vill ha sina variabler.
process.env.TURSO_DATABASE_URL ||= "file:./prisma/shadow.db";
process.env.TURSO_AUTH_TOKEN ||= "test";

import { parseRank, signalsFromImport, hasSeoData } from "../src/lib/enrichment/import-claims.ts";
import { deriveKeyword, normalizeCompany, hostOf, absolutePosition } from "../src/lib/enrichment/serper.ts";
import { autoGuessMapping } from "../src/lib/csv-parser.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

console.log("\nparseRank — placering kontra förbehåll");
{
  check("rent tal blir tal", parseRank("14")?.num === 14);
  check("plats 1 blir tal", parseRank("1")?.num === 1);
  check('">20" blir INTE talet 20', parseRank(">20")?.num === null);
  check('">20" bär förbehållet', parseRank(">20")?.str === "utanför topp 20");
  check('">100" bär djupet', parseRank(">100")?.str === "utanför topp 100");
  check('"> 50" med blanksteg', parseRank("> 50")?.str === "utanför topp 50");
  check("utanför topp 100 i klartext", parseRank("utanför topp 100")?.str === "utanför topp 100");
  check("ej hittad utan siffra", parseRank("ej hittad")?.str === "syns inte på sökordet");
  check("felsträng från avbruten körning kastas", parseRank("fel: timeout") === null);
  check("tomt kastas", parseRank("") === null);
  check("odefinierat kastas", parseRank(undefined) === null);
  check("orimligt tal kastas", parseRank("9999") === null);
  check("noll är ingen placering", parseRank("0") === null);
}

console.log("\nsignalsFromImport — vad som blir en säljbar brist");
{
  const found = signalsFromImport({ seoRank: "3" });
  const rank = found.find((s) => s.key === "seo.rank");
  check("topp 5 är ingen brist", rank?.weakness === false);
  check("topp 5 har låg säljstyrka", rank?.strength === 2);
  check("topp 5 har enheten position", rank?.unit === "position");

  const mid = signalsFromImport({ seoRank: "14" }).find((s) => s.key === "seo.rank");
  check("plats 14 är en brist", mid?.weakness === true);
  check("plats 14 har högsta säljstyrka", mid?.strength === 5);

  const missing = signalsFromImport({ seoRank: ">100" }).find((s) => s.key === "seo.rank");
  check("utanför topp 100 är en brist", missing?.weakness === true);
  check("utanför topp 100 saknar tal", missing?.valueNum === null);
  check("utanför topp 100 saknar enhet", missing?.unit === null);

  const zero = signalsFromImport({ gmbReviews: 0 }).find((s) => s.key === "gmb.reviewCount");
  check("noll recensioner sparas som uppgift", zero?.valueNum === 0);
  check("noll recensioner är en brist", zero?.weakness === true);
  check("noll recensioner har högsta säljstyrka", zero?.strength === 5);

  const many = signalsFromImport({ gmbReviews: 87 }).find((s) => s.key === "gmb.reviewCount");
  check("87 recensioner är ingen brist", many?.weakness === false);

  const rating = signalsFromImport({ gmbRating: 5 }).find((s) => s.key === "gmb.rating");
  check("betyg 5,0 är ingen brist", rating?.weakness === false);
  const badRating = signalsFromImport({ gmbRating: 3.2 }).find((s) => s.key === "gmb.rating");
  check("betyg 3,2 är en brist", badRating?.weakness === true);
  check("betyg över 5 kastas", signalsFromImport({ gmbRating: 9 }).length === 0);

  const all = signalsFromImport({
    seoRank: ">20", seoKeyword: "revisor Malmö",
    seoTop3: "ludvig.se > grantthornton.se > jonzonrevision.se",
    seoRivals: 10, gmbRating: 4.8, gmbReviews: 12, gmbCategory: "Revisor",
  });
  check("hel rad ger sju uppgifter", all.length === 7, `fick ${all.length}`);
  check("allt märks som importerat", all.every((s) => s.source === "import"));
  check("importens säkerhet ligger under hämtningens",
    all.every((s) => s.confidence <= 75));

  check("tom rad ger inga uppgifter", signalsFromImport({}).length === 0);
  check("hasSeoData ser tom rad", hasSeoData({}) === false);
  check("hasSeoData ser noll recensioner", hasSeoData({ gmbReviews: 0 }) === true);
}

console.log("\nderiveKeyword — hellre inget sökord än ett gissat");
{
  check("bransch + ort", deriveKeyword("Tandvård", "Malmö") === "tandvård malmö");
  check("första ledet ur en sammansatt etikett",
    deriveKeyword("Ekonomi & redovisning", "Lund") === "ekonomi lund");
  check("utan ort blir det inget", deriveKeyword("Tandvård", null) === null);
  check("utan bransch blir det inget", deriveKeyword(null, "Malmö") === null);
  check("blanksteg räknas som tomt", deriveKeyword("  ", "Malmö") === null);
}

console.log("\nnormalizeCompany — samma bolag, olika stavning");
{
  check("bolagsform bär ingen identitet",
    normalizeCompany("Nordic Bygg AB") === normalizeCompany("Nordic Bygg Aktiebolag"));
  check("versaler spelar ingen roll",
    normalizeCompany("NORDIC BYGG AB") === normalizeCompany("Nordic Bygg ab"));
  check("å ä ö fälls ned", normalizeCompany("Åkeriet Söder AB") === "akeriet soder");
  check("olika bolag skiljs åt",
    normalizeCompany("Nordic Bygg AB") !== normalizeCompany("Nordic Städ AB"));
}

console.log("\nhostOf — positionen matchas på domän, aldrig på namn");
{
  check("www strippas", hostOf("https://www.exempel.se/kontakt") === "exempel.se");
  check("utan schema", hostOf("exempel.se") === "exempel.se");
  check("versaler ned", hostOf("HTTPS://Exempel.SE") === "exempel.se");
  check("skräp ger null", hostOf("—") === null);
  check("tomt ger null", hostOf(null) === null);
}

console.log("\nabsolutePosition — sida 2 är inte topp tio");
{
  // Serper räknar om från 1 på varje sida. Uppmätt 2026-08-07: page=2 svarar
  // med positionerna 1-10, inte 11-20.
  check("sida 1 lämnas orörd", absolutePosition(1, 4) === 4);
  check("sida 2 position 4 är plats 14", absolutePosition(2, 4) === 14);
  check("sida 3 position 7 är plats 27", absolutePosition(3, 7) === 27);
  check("sida 5 position 10 är plats 50", absolutePosition(5, 10) === 50);
  check("första på sida 2 är plats 11", absolutePosition(2, 1) === 11);
}

console.log("\nautoGuessMapping — leadmotorns egna kolumnnamn");
{
  const headers = [
    "foretag", "telefon", "orgnr", "kommun", "bransch", "hemsida",
    "google_position", "sokord", "topp3_pa_sokordet", "antal_konkurrenter",
    "recensioner", "betyg", "kategori", "adress",
  ];
  const m = autoGuessMapping(headers);
  check("google_position → seo_rank", m["google_position"] === "seo_rank");
  check("sokord → seo_keyword", m["sokord"] === "seo_keyword");
  check("topp3_pa_sokordet → seo_top3", m["topp3_pa_sokordet"] === "seo_top3");
  check("antal_konkurrenter → seo_rivals", m["antal_konkurrenter"] === "seo_rivals");
  check("recensioner → gmb_reviews", m["recensioner"] === "gmb_reviews");
  check("betyg → gmb_rating", m["betyg"] === "gmb_rating");
  check("kategori → gmb_category", m["kategori"] === "gmb_category");

  // De gamla reglerna får inte ha tagit skada av de nya.
  check("foretag är fortfarande bolagsnamn", m["foretag"] === "company");
  check("hemsida är fortfarande hemsida", m["hemsida"] === "website");
  check("bransch är fortfarande bransch", m["bransch"] === "industry");
  check("kommun är fortfarande ort", m["kommun"] === "city");
  check("adress är fortfarande adress", m["adress"] === "address");
  check("telefon är fortfarande direktnummer", m["telefon"] === "direct_phone");
  check("orgnr är fortfarande org-nummer", m["orgnr"] === "org_number");
}

console.log(`\n${pass} godkända, ${fail} underkända\n`);
process.exit(fail > 0 ? 1 : 0);
