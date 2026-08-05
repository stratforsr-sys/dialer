/**
 * Kör anrikningen mot databasen.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types --env-file=.env.local \
 *        scripts/run-enrichment.ts --tier 0 --limit 50
 *
 * Samma kod som cron-jobbet. Att kunna köra den för hand är poängen: man ska
 * se vad som faktiskt hämtas innan det släpps lös på hela databasen.
 */

import { enrichBatch } from "../src/lib/enrichment/orchestrator";

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
}

const tier = Number(arg("tier", "0")) === 1 ? 1 : 0;
const limit = Number(arg("limit", "25"));

console.log(`Anrikar upp till ${limit} leads, nivå ${tier}${tier === 1 ? " (inklusive PageSpeed — långsamt)" : ""}\n`);

const started = Date.now();
const results = await enrichBatch({ tier, limit });

const claims = results.reduce((n, r) => n + r.claims, 0);
const weaknesses = results.reduce((n, r) => n + r.weaknesses, 0);
const withNone = results.filter((r) => r.weaknesses === 0).length;

for (const r of results.slice(0, 25)) {
  const bar = "❗".repeat(Math.min(r.weaknesses, 6));
  console.log(`  ${r.companyName.slice(0, 42).padEnd(44)} ${String(r.weaknesses).padStart(2)} ${bar}`);
}

console.log(`\n${"─".repeat(64)}`);
console.log(`Leads:                 ${results.length}`);
console.log(`Uppgifter skrivna:     ${claims}`);
console.log(`Säljbara brister:      ${weaknesses} (${(weaknesses / Math.max(results.length, 1)).toFixed(1)} per lead)`);
console.log(`Utan någon brist:      ${withNone}`);
console.log(`Tid:                   ${Math.round((Date.now() - started) / 1000)} s`);

const failed = results.flatMap((r) => r.failed);
if (failed.length) console.log(`Providers utan svar:   ${Array.from(new Set(failed)).join(", ")}`);
console.log("");

process.exit(0);
