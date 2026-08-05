/**
 * Testar signalproviders mot riktiga sajter.
 *   node --experimental-strip-types scripts/test-enrichment.ts
 *   node --experimental-strip-types scripts/test-enrichment.ts --pagespeed
 *
 * Ingen databas inblandad — det här svarar på frågan "hämtar kontrollerna
 * rätt saker från verkliga svenska webbplatser", vilket är det enda sättet
 * att veta att de går att säga högt på ett samtal.
 *
 * PageSpeed hoppas över som standard: varje sajt tar 20–60 sekunder.
 */

import { websiteProvider } from "../src/lib/enrichment/website";
import { pagespeedProvider } from "../src/lib/enrichment/pagespeed";
import type { SignalContext } from "../src/lib/enrichment/types";

const withPagespeed = process.argv.includes("--pagespeed");

const TARGETS: Array<{ name: string; website: string | null }> = [
  { name: "Regeringskansliet", website: "https://www.regeringen.se" },
  { name: "SVT", website: "svt.se" },
  { name: "Bolag utan sajt", website: null },
  { name: "Domän som inte finns", website: "https://detta-bolag-finns-inte-12345.se" },
  { name: "HTTP utan certifikat", website: "http://neverssl.com" },
];

function ctx(name: string, website: string | null): SignalContext {
  return { leadId: "test", companyName: name, website, orgNumber: null, address: "Göteborg" };
}

function show(v: { valueNum?: number | null; valueStr?: string | null; valueBool?: boolean | null; unit?: string | null }) {
  if (v.valueStr != null) return `"${v.valueStr.slice(0, 50)}"`;
  if (v.valueNum != null) return `${v.valueNum}${v.unit ? " " + v.unit : ""}`;
  if (v.valueBool != null) return v.valueBool ? "ja" : "NEJ";
  return "—";
}

for (const t of TARGETS) {
  console.log(`\n── ${t.name} ${t.website ? `(${t.website})` : "(ingen sajt)"}`);
  const started = Date.now();

  try {
    const signals = await websiteProvider.collect(ctx(t.name, t.website));
    console.log(`   ${signals.length} signaler på ${Date.now() - started} ms`);
    for (const s of signals) {
      const flag = s.weakness ? "❗" : "  ";
      console.log(`   ${flag} ${s.key.padEnd(30)} ${show(s).padEnd(24)} säkerhet ${s.confidence}`);
    }
    const weaknesses = signals.filter((s) => s.weakness);
    console.log(`   → ${weaknesses.length} säljbara svagheter`);

    if (withPagespeed && t.website && signals.some((s) => s.key === "tech.siteReachable" && s.valueBool)) {
      console.log("   PageSpeed (två körningar, tar en stund)...");
      const ps = await pagespeedProvider.collect(ctx(t.name, t.website));
      for (const s of ps) {
        const flag = s.weakness ? "❗" : "  ";
        console.log(`   ${flag} ${s.key.padEnd(30)} ${show(s).padEnd(24)} säkerhet ${s.confidence}`);
      }
      if (ps.length === 0) console.log("   (inget svar från PageSpeed)");
    }
  } catch (err) {
    console.log(`   ✗ ${err instanceof Error ? err.message : err}`);
  }
}

console.log("");
