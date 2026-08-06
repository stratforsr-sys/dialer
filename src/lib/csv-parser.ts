import * as XLSX from "xlsx";
import type { CSVData, FieldMapping } from "@/types";

export function parseXLSX(buffer: ArrayBuffer): CSVData {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const jsonData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (jsonData.length < 2) return { headers: [], rows: [] };

  const headers = jsonData[0].map((h) => String(h || "").trim());
  const rows = jsonData.slice(1).map((rowArray) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = String(rowArray[i] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

export function parseCSV(text: string): CSVData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Auto-detect separator
  const semicolons = (lines[0].match(/;/g) || []).length;
  const commas = (lines[0].match(/,/g) || []).length;
  const tabs = (lines[0].match(/\t/g) || []).length;
  const sep = tabs > semicolons && tabs > commas ? "\t" : semicolons > commas ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQ = !inQ;
      } else if (c === sep && !inQ) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] || "";
    });
    return obj;
  });

  return { headers, rows };
}

/**
 * Tolkar ett tal ur en importfil.
 *
 * Företagsregisterexporter skriver samma siffra på ett halvdussin sätt:
 * "1 234 567", "1.234.567", "1 234 567,50", "12,5", "25 st", "4 500 tkr",
 * ofta med hårda mellanslag från Excel. `Number("1 234 567")` ger NaN, så utan
 * normalisering blir kolumnen tyst tom och ingen märker det förrän någon
 * undrar varför alla leads saknar omsättning.
 */
export function parseNumeric(raw: string | undefined | null): number | null {
  if (!raw) return null;

  // Bort med allt utom siffror, separatorer och minustecken — valutakoder,
  // "st", "tkr", hårda mellanslag.
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Båda förekommer → den som står sist är decimaltecknet, den andra är
    // tusenavskiljare. Gäller åt båda hållen: "1.234,50" och "1,234.50".
    const decimalAt = Math.max(lastComma, lastDot);
    normalized =
      cleaned.slice(0, decimalAt).replace(/[,.]/g, "") + "." + cleaned.slice(decimalAt + 1);
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (!sep) {
      normalized = cleaned;
    } else {
      const occurrences = cleaned.split(sep).length - 1;
      const digitsAfter = cleaned.length - cleaned.lastIndexOf(sep) - 1;
      // Flera separatorer, eller exakt tre siffror efter den enda → tusental.
      // "1,234" blir alltså 1234 och inte 1,234. Svenska företagsdata skriver
      // decimaler med en eller två siffror ("12,5"), aldrig tre — så
      // tusentalstolkningen är den säkrare gissningen när det är tvetydigt.
      normalized =
        occurrences > 1 || digitsAfter === 3
          ? cleaned.split(sep).join("")
          : cleaned.replace(sep, ".");
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Auto-guess which CSV columns map to which system fields
 */
export function autoGuessMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};

  headers.forEach((h) => {
    const hl = h.toLowerCase().trim();

    if (
      hl === "förnamn" || hl === "fornamn" || hl === "tilltalsnamn" ||
      hl === "first name" || hl === "firstname" || hl === "first_name" || hl === "given name"
    ) {
      mapping[h] = "first_name";
    } else if (
      hl === "efternamn" || hl === "släktnamn" ||
      hl === "last name" || hl === "lastname" || hl === "last_name" || hl === "surname" || hl === "family name"
    ) {
      mapping[h] = "last_name";
    } else if (hl === "name" || hl === "namn" || hl === "kontaktnamn" || hl === "contact name") {
      mapping[h] = "name";
    } else if (hl.includes("company") || hl.includes("företag") || hl === "company name" || hl === "bolagsnamn") {
      mapping[h] = "company";
    } else if (hl === "roll" || hl === "title" || hl === "titel" || hl === "befattning" || hl === "position") {
      mapping[h] = "role";
    } else if (hl === "phones" || hl === "phone" || hl === "telefon" || hl === "mobil" || hl === "mobilnummer" || hl.includes("direct") || hl.includes("direkt")) {
      mapping[h] = "direct_phone";
    } else if (hl.includes("växel") || hl === "org_phone" || hl.includes("switchboard") || hl.includes("företagsnummer")) {
      mapping[h] = "switchboard";
    } else if (hl.includes("email") || hl.includes("e-post") || hl.includes("mail") || hl === "epost") {
      mapping[h] = "email";
    } else if (
      hl === "url" || hl === "hemsida" || hl === "website" || hl === "webb" || hl === "web" || hl === "www" ||
      hl.includes("hemsida") || hl.includes("webbplats") || hl.includes("webbadress") ||
      hl.includes("website") || hl.includes("homepage") ||
      (hl.includes("webb") && !hl.includes("linkedin")) ||
      (hl.includes("url") && (hl.includes("web") || hl.includes("hem") || hl.includes("site")))
    ) {
      mapping[h] = "website";
    } else if (hl.includes("linkedin")) {
      mapping[h] = "linkedin";
    } else if (
      hl === "stad" || hl === "ort" || hl === "postort" || hl === "city" || hl === "town" ||
      hl.includes("postort") || hl.includes("besöksort")
    ) {
      mapping[h] = "city";
    } else if (
      // Ligger efter e-post- och hemsidereglerna med flit: "e-postadress" och
      // "webbadress" innehåller båda "adress" och ska inte hamna här.
      hl.includes("adress") || hl.includes("address") || hl === "gata" || hl === "street"
    ) {
      mapping[h] = "address";
    } else if (
      // Koden före branschtexten: "SNI-kod" innehåller inte "bransch", men en
      // kolumn som heter "Branschkod" gör det — och den är en kod, inte text.
      hl === "sni" || hl.includes("sni-kod") || hl.includes("snikod") ||
      hl.includes("sni kod") || hl.includes("branschkod") || hl.includes("bransch_kod")
    ) {
      mapping[h] = "industry_code";
    } else if (
      hl.includes("bransch") || hl.includes("verksamhet") || hl.includes("näringsgren") ||
      hl === "industry" || hl === "sector"
    ) {
      mapping[h] = "industry";
    } else if (
      hl.includes("anställda") || hl.includes("anstallda") || hl.includes("antal anst") ||
      hl === "employees" || hl === "employee count" || hl === "headcount" || hl === "antal"
    ) {
      mapping[h] = "employees";
    } else if (
      hl.includes("omsättning") || hl.includes("omsattning") || hl.includes("turnover") ||
      hl.includes("revenue") || hl === "nettoomsättning" || hl === "intäkter"
    ) {
      mapping[h] = "revenue";
    } else if ((hl.includes("org") && (hl.includes("num") || hl.includes("nr"))) || hl === "organisationsnummer") {
      mapping[h] = "org_number";
    } else {
      mapping[h] = "skip";
    }
  });

  return mapping;
}
