/**
 * Kör signalproviders mot riktiga leads ur produktionskopian.
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/test-enrichment-real.ts
 *   ... --pagespeed        (långsamt: 20–60 s per sajt)
 *
 * Det här är försvarbarhetstestet: skulle en säljare våga säga det här högt?
 * Läs utfallet och fråga dig det för varje rad. En signal som är fel EN gång
 * gör att säljaren slutar lita på hela verktyget.
 */

import { readFileSync } from "node:fs";
import { websiteProvider } from "../src/lib/enrichment/website";
import { pagespeedProvider } from "../src/lib/enrichment/pagespeed";
import type { SignalContext, Signal } from "../src/lib/enrichment/types";

const withPagespeed = process.argv.includes("--pagespeed");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 12;

// Leads läses ur en enkel TSV som dumpats ur shadow-databasen, så scriptet
// inte behöver Prisma och Turso-uppkoppling.
const rows = readFileSync("scripts/.leads.tsv", "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [companyName, website, address] = l.split("\t");
    return { companyName, website: website || null, address: address || null };
  })
  .slice(0, LIMIT);

function show(s: Signal) {
  if (s.valueStr != null) return `"${s.valueStr.slice(0, 44)}"`;
  if (s.valueNum != null) return `${s.valueNum}${s.unit ? " " + s.unit : ""}`;
  if (s.valueBool != null) return s.valueBool ? "ja" : "NEJ";
  return "—";
}

let totalWeak = 0;
let sitesDown = 0;
let noSsl = 0;
let notMobile = 0;
const perKey = new Map<string, number>();

console.log(`\nKör ${rows.length} riktiga leads\n${"─".repeat(72)}`);

for (const lead of rows) {
  const ctx: SignalContext = {
    leadId: "x",
    companyName: lead.companyName,
    website: lead.website,
    orgNumber: null,
    address: lead.address,
  };

  const started = Date.now();
  const signals = await websiteProvider.collect(ctx);
  const weak = signals.filter((s) => s.weakness);
  totalWeak += weak.length;

  for (const s of weak) perKey.set(s.key, (perKey.get(s.key) ?? 0) + 1);
  if (signals.some((s) => s.key === "tech.siteReachable" && !s.valueBool)) sitesDown++;
  if (signals.some((s) => s.key === "tech.hasSSL" && s.valueBool === false)) noSsl++;
  if (signals.some((s) => s.key === "tech.mobileFriendly" && s.valueBool === false)) notMobile++;

  console.log(`\n${lead.companyName}  (${Date.now() - started} ms)`);
  console.log(`  ${lead.website ?? "ingen sajt"}`);
  if (weak.length === 0) {
    console.log("  inga svagheter — ingen pitch att bygga på");
  } else {
    for (const s of weak) {
      console.log(`  ❗ ${s.key.padEnd(30)} ${show(s).padEnd(26)} säkerhet ${s.confidence}`);
    }
  }

  if (withPagespeed && lead.website) {
    const ps = await pagespeedProvider.collect(ctx);
    for (const s of ps.filter((x) => x.weakness)) {
      console.log(`  ❗ ${s.key.padEnd(30)} ${show(s).padEnd(26)} säkerhet ${s.confidence}`);
    }
  }
}

console.log(`\n${"─".repeat(72)}`);
console.log(`Svagheter totalt:      ${totalWeak} (${(totalWeak / rows.length).toFixed(1)} per lead)`);
console.log(`Sajter som inte svarar: ${sitesDown}`);
console.log(`Utan HTTPS:             ${noSsl}`);
console.log(`Inte mobilanpassade:    ${notMobile}`);
console.log("\nVanligast:");
for (const [k, n] of Array.from(perKey.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(32)} ${n}`);
}
console.log("");
