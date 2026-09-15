/**
 * Verifiering av identitetsnycklarna.
 *   node --experimental-strip-types scripts/test-lead-identitet.ts
 *
 * Det som måste hålla: **två olika bolag får ALDRIG få samma nyckel.**
 *
 * Nyckeln avgör om en importerad rad slås ihop med ett befintligt lead. Slår
 * den ihop fel bolag flyter två bolags samtalshistorik ihop permanent — och
 * `CallAttempt` är append-only, så det går inte att separera i efterhand.
 * Missar den en träff blir det i stället en dubblett, som går att städa.
 *
 * Proven nedan är därför skeva med flit: det finns fler fall som kontrollerar
 * att nyckeln säger NEJ än att den säger ja.
 */

import { orgNyckel, namnOrtNyckel } from "../src/lib/lead-identitet.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

console.log("\norgNyckel — samma bolag, olika skrivsätt");

// Det verkliga fallet: 83 dubblettgrupper i produktionen 2026-09-15, där
// samma bolag låg två gånger för att bindestrecket skilde.
check(
  "bindestreck spelar ingen roll",
  orgNyckel("559523-0201") === orgNyckel("5595230201"),
  `${orgNyckel("559523-0201")} vs ${orgNyckel("5595230201")}`
);
check("mellanslag spelar ingen roll", orgNyckel("556000 0001") === "5560000001");
check("punkter spelar ingen roll", orgNyckel("556000.0001") === "5560000001");

// 345 leads bär tolvsiffriga nummer med sekelprefix.
check(
  "sekelprefix fälls bort",
  orgNyckel("192901040689") === "2901040689",
  String(orgNyckel("192901040689"))
);
check(
  "prefixat och oprefixat är samma bolag",
  orgNyckel("192901040689") === orgNyckel("290104-0689")
);

console.log("\norgNyckel — det som INTE får bli en nyckel");

// Fyra ringlistor importerades med fel kolumnmappning och fick värden som "9"
// och "10" i org-nummerkolumnen. Blev de nycklar hade varje bolag med samma
// skräpvärde slagits ihop till ett enda lead.
check("ensiffrigt skräp ger null", orgNyckel("9") === null);
check("tvåsiffrigt skräp ger null", orgNyckel("10") === null);
check("postnummer ger null", orgNyckel("12345") === null);
check("tom sträng ger null", orgNyckel("") === null);
check("null ger null", orgNyckel(null) === null);
check("undefined ger null", orgNyckel(undefined) === null);
check("ren text ger null", orgNyckel("Fönsterputs") === null);
check("elva siffror ger null", orgNyckel("12345678901") === null);

console.log("\nnamnOrtNyckel — samma bolag");

check(
  "versaler spelar ingen roll",
  namnOrtNyckel("Norby VVS AB", "Uppsala") === namnOrtNyckel("norby vvs ab", "uppsala")
);
check(
  "bolagsform fälls bort",
  namnOrtNyckel("Norby VVS AB", "Uppsala") === namnOrtNyckel("Norby VVS", "Uppsala")
);
check(
  "punkter i bolagsformen spelar ingen roll",
  namnOrtNyckel("Norby VVS A.B.", "Uppsala") === namnOrtNyckel("Norby VVS AB", "Uppsala")
);
check(
  "dubbla mellanslag spelar ingen roll",
  namnOrtNyckel("Norby  VVS AB", " Uppsala ") === namnOrtNyckel("Norby VVS AB", "Uppsala")
);
check(
  "åäö överlever — lower() i SQLite hade inte klarat det",
  namnOrtNyckel("Sidbäcks El AB", "Uppsala") === namnOrtNyckel("SIDBÄCKS EL AB", "UPPSALA")
);

console.log("\nnamnOrtNyckel — det som INTE får matcha");

check(
  "samma namn i olika orter är olika bolag",
  namnOrtNyckel("Städsnabben AB", "Uppsala") !== namnOrtNyckel("Städsnabben AB", "Göteborg")
);
check(
  "olika namn i samma ort är olika bolag",
  namnOrtNyckel("Renzo AB", "Uppsala") !== namnOrtNyckel("Renso AB", "Uppsala")
);
check("utan ort finns ingen nyckel", namnOrtNyckel("Renzo AB", null) === null);
check("utan namn finns ingen nyckel", namnOrtNyckel(null, "Uppsala") === null);
check("tom ort ger null", namnOrtNyckel("Renzo AB", "   ") === null);
check(
  "ett namn som BARA är en bolagsform ger null",
  namnOrtNyckel("AB", "Uppsala") === null
);

console.log("\nDe två nycklarna blandas aldrig ihop");

// Formen `namn|ort` kan inte förväxlas med tio siffror. Trivialt — men det är
// samma Map-nyckelrymd i `hittaId` om någon slår ihop kartorna, och då hade en
// kollision varit tyst.
check(
  "namn+ort-nyckeln bär en avgränsare som org-nyckeln aldrig kan innehålla",
  (namnOrtNyckel("Renzo", "Uppsala") ?? "").includes("|") &&
    !(orgNyckel("5595230201") ?? "").includes("|")
);

console.log(`\n${pass} godkända, ${fail} underkända\n`);
if (fail > 0) process.exit(1);
