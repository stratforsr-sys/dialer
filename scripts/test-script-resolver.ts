/**
 * Verifiering av manusmotorn.
 *   node --experimental-strip-types scripts/test-script-resolver.ts
 *
 * Det som måste hålla: en säljare får ALDRIG en mening med ett tomt hål i.
 */

import {
  resolveScript, lintVariants, placeholdersIn, valjNiva,
  type ResolverVariant, type ResolverClaim,
} from "../src/lib/script-resolver.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const VARIANTS: ResolverVariant[] = [
  {
    id: "v1", label: "Rank + konkurrent", priority: 10, minConfidence: 60,
    body: "Jag såg att ni ligger på plats {seo.rank} när folk googlar {seo.keyword} — {seo.competitor} ligger tvåa. Vet ni om det?",
    requiredKeysJson: JSON.stringify(["seo.rank", "seo.keyword", "seo.competitor"]),
  },
  {
    id: "v2", label: "Bara rank", priority: 20, minConfidence: 60,
    body: "Ni ligger på plats {seo.rank} på {seo.keyword}. Vet ni om det?",
    requiredKeysJson: JSON.stringify(["seo.rank", "seo.keyword"]),
  },
  {
    id: "v3", label: "Laddtid", priority: 30, minConfidence: 60,
    body: "Googles eget test ger er sajt {pagespeed.mobileLcp} sekunder i mobilen. Hälften försvinner innan den syns.",
    requiredKeysJson: JSON.stringify(["pagespeed.mobileLcp"]),
  },
  {
    id: "v4", label: "Fallback", priority: 99, minConfidence: 0,
    body: "Hej, det är {säljare} från Clicknet. Jag ringer om {företag}s synlighet på Google.",
    requiredKeysJson: "[]",
  },
];

const CTX = { säljare: "Anders", företag: "Nordic Dental AB" };

function claim(key: string, v: Partial<ResolverClaim>): ResolverClaim {
  return { key, valueNum: null, valueStr: null, valueBool: null, unit: null, confidence: 90, ...v };
}

console.log("\nvariantval");
{
  const claims = [
    claim("seo.rank", { valueNum: 14 }),
    claim("seo.keyword", { valueStr: "tandläkare Göteborg" }),
    claim("seo.competitor", { valueStr: "Smile Center" }),
  ];
  const r = resolveScript(VARIANTS, claims, CTX);
  check("full data → högst prioriterad variant", r.variantId === "v1", `blev ${r.variantId}`);
  check("platshållare ersatta", r.text.includes("plats 14") && r.text.includes("Smile Center"), r.text);
  check("inga hål kvar", !r.text.includes("{"), r.text);
}
{
  // Konkurrenten saknas → ska falla till variant 2, inte rendera tomt.
  const claims = [
    claim("seo.rank", { valueNum: 14 }),
    claim("seo.keyword", { valueStr: "tandläkare Göteborg" }),
  ];
  const r = resolveScript(VARIANTS, claims, CTX);
  check("saknad uppgift → nästa variant", r.variantId === "v2", `blev ${r.variantId}`);
  check("inga hål kvar", !r.text.includes("{"), r.text);
}
{
  // Rank finns men med för låg konfidens → får inte användas.
  const claims = [
    claim("seo.rank", { valueNum: 14, confidence: 40 }),
    claim("seo.keyword", { valueStr: "tandläkare Göteborg" }),
    claim("pagespeed.mobileLcp", { valueNum: 6200, unit: "ms" }),
  ];
  const r = resolveScript(VARIANTS, claims, CTX);
  check("låg konfidens spärrar varianten", r.variantId === "v3", `blev ${r.variantId}`);
  check("millisekunder blir sekunder", r.text.includes("6,2"), r.text);
}
{
  const r = resolveScript(VARIANTS, [], CTX);
  check("ingen data → fallback", r.variantId === "v4", `blev ${r.variantId}`);
  check("kontextvärden fylls i", r.text.includes("Anders") && r.text.includes("Nordic Dental AB"), r.text);
  check("inga hål kvar", !r.text.includes("{"), r.text);
}
{
  const r = resolveScript(VARIANTS.filter((v) => v.id !== "v4"), [], CTX);
  check("ingen matchande variant → tomt, inte trasig text", r.empty && r.text === "");
}

console.log("\nplatshållare");
check("hittar alla", placeholdersIn("A {x.y} B {z} C {x.y}").sort().join(",") === "x.y,z");

console.log("\nlint");
{
  const problems = lintVariants(VARIANTS);
  check("godkänt manus ger inga anmärkningar", problems.length === 0, problems.join(" | "));
}
{
  const problems = lintVariants(VARIANTS.filter((v) => v.id !== "v4"));
  check("saknad fallback upptäcks", problems.some((p) => p.includes("utan datakrav")), problems.join(" | "));
}
{
  const bad: ResolverVariant[] = [
    { id: "a", label: "Fallback", priority: 1, minConfidence: 0, body: "Hej", requiredKeysJson: "[]" },
    { id: "b", label: "Onåbar", priority: 2, minConfidence: 0, body: "Plats {seo.rank}", requiredKeysJson: JSON.stringify(["seo.rank"]) },
  ];
  const problems = lintVariants(bad);
  check("onåbar variant upptäcks", problems.some((p) => p.includes("Onåbar")), problems.join(" | "));
}
{
  const bad: ResolverVariant[] = [
    { id: "a", label: "Oskyddad", priority: 1, minConfidence: 0, body: "Plats {seo.rank}", requiredKeysJson: "[]" },
  ];
  const problems = lintVariants(bad);
  check("oskyddad platshållare upptäcks", problems.some((p) => p.includes("utan att kräva")), problems.join(" | "));
}

// ── Nivåvalet: vem ser vilket manus (migration 028) ────────────────────────
//
// Regeln avgör vad en säljare läser upp i ett skarpt samtal. Går den fel
// tappar antingen någon sitt manus, eller så möter en text skriven åt en enda
// person hela golvet — och inget av det syns förrän någon berättar det.

console.log("\nNivåvalet");
{
  type T = { id: string; listId: string | null; assignedToId: string | null };
  const allmant: T   = { id: "allmänt", listId: null,   assignedToId: null };
  const mappens: T   = { id: "mappens", listId: "L1",   assignedToId: null };
  const minAlla: T   = { id: "min-alla", listId: null,  assignedToId: "U1" };
  const minMapp: T   = { id: "min-mapp", listId: "L1",  assignedToId: "U1" };

  const ids = (r: T[]) => r.map((t) => t.id).sort().join(",");

  check("bara allmänt → allmänt", ids(valjNiva([allmant])) === "allmänt");

  check(
    "mappens ersätter det allmänna (regeln från 026)",
    ids(valjNiva([allmant, mappens])) === "mappens"
  );

  check(
    "mitt personliga ersätter mappens",
    ids(valjNiva([allmant, mappens, minAlla])) === "min-alla"
  );

  check(
    "mitt i mappen slår mitt allmänna",
    ids(valjNiva([allmant, mappens, minAlla, minMapp])) === "min-mapp"
  );

  check(
    "flera manus på vinnande nivå följs åt",
    ids(valjNiva([allmant, mappens, minAlla, { ...minAlla, id: "min-alla-2" }])) ===
      "min-alla,min-alla-2"
  );

  // Utan mapp faller nivå 1 och 3 bort redan i frågan mot databasen. Det som
  // återstår ska då välja mitt personliga före det allmänna.
  check(
    "utan mapp: mitt personliga före det allmänna",
    ids(valjNiva([allmant, minAlla])) === "min-alla"
  );

  check("tom lista ger tom lista", valjNiva([] as T[]).length === 0);

  // Anroparen gallrar bort andras. Provet står här för att säga att funktionen
  // INTE gör det — den som lägger till en ny anropare ska inte tro något annat.
  const annans: T = { id: "annans", listId: null, assignedToId: "U2" };
  check(
    "funktionen skiljer nivåer, inte personer — gallringen ligger i frågan",
    ids(valjNiva([allmant, annans])) === "annans"
  );
}

console.log(`\n${pass} godkända, ${fail} misslyckade\n`);
process.exit(fail > 0 ? 1 : 0);
