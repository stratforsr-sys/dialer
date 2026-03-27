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
 * Auto-guess which CSV columns map to which system fields
 */
export function autoGuessMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};

  headers.forEach((h) => {
    const hl = h.toLowerCase().trim();

    if (hl === "name" || hl === "namn" || hl === "kontaktnamn" || hl === "contact name") {
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
    } else if (hl === "url" || hl === "hemsida" || hl === "website" || hl === "webb" || hl === "web") {
      mapping[h] = "website";
    } else if (hl.includes("linkedin")) {
      mapping[h] = "linkedin";
    } else if ((hl.includes("org") && (hl.includes("num") || hl.includes("nr"))) || hl === "organisationsnummer") {
      mapping[h] = "org_number";
    } else {
      mapping[h] = "skip";
    }
  });

  return mapping;
}
