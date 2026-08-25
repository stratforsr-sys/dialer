/**
 * Tolkar ett registreringsdatum ur en importfil.
 *
 * Ligger i en egen fil och inte i `csv-parser.ts` med `parseNumeric`, av ett
 * enda skäl: csv-parser importerar `xlsx`. Import-endpointen behöver samma
 * tolkning som webbläsaren, och att dra in ett kalkylbladsbibliotek i en
 * serverless-funktion för en datumsträngs skull är inte värt det.
 *
 * Rena funktioner, körbara på båda sidor. Klienten använder dem för
 * förhandsgranskningen, servern för det som faktiskt skrivs — filen skickar
 * råtexten, precis som för SEO-placeringen, och servern avgör vad som är ett
 * datum och vad som är skräp.
 */

/** Bolagsregister som påstår sig ha registrerats före 1800 eller nästa år har fel. */
const MIN_YEAR = 1800;

/**
 * Excels serienummer för datum. Ett datumformaterat Excel-fält kommer ut ur
 * `sheet_to_json` som talet 43538, inte som "2019-03-14" — utan den här
 * omräkningen hade varje xlsx-fil gett en tom kolumn.
 *
 * Epoken är 1899-12-30 och inte 1900-01-01: Lotus 1-2-3 trodde att 1900 var
 * ett skottår, Excel ärvde buggen med flit för kompatibilitet, och alla
 * bibliotek räknar därför två dagar bakåt.
 */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Ett datum utan tid, i UTC — samma dag oavsett var läsaren sitter. */
function utcDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Fångar 31 februari: Date rullar vidare till 3 mars i stället för att säga
  // ifrån, och en sådan tyst förskjutning är värre än ett tomt fält.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return inRange(date);
}

/** Utanför rimligt spann är det en feltolkning, inte en uppgift. */
function inRange(date: Date): Date | null {
  const y = date.getUTCFullYear();
  return y >= MIN_YEAR && y <= new Date().getUTCFullYear() + 1 ? date : null;
}

/**
 * Registreringsdatum ur en cell.
 *
 * Format som förekommer i svenska bolagsexporter, i tur och ordning:
 * `2019-03-14`, `2019-03-14T00:00:00Z`, `20190314`, `2019-03`, `2019`,
 * `14/3 2019`, `14.03.2019`, samt Excels serienummer.
 *
 * **Dag före månad när det är tvetydigt.** `03/04/2019` blir 3 april, inte
 * 4 mars. Filerna kommer från svenska register; den amerikanska ordningen
 * hade varit en gissning på det ovanligare fallet. Står ett tal över 12
 * först är det entydigt en dag och då spelar regeln ingen roll.
 *
 * Ett årtal ensamt landar på 1 januari. Det är påhittad precision på dagen,
 * men frågan kolumnen ska svara på är "hur gammalt är bolaget" — och det
 * svaret blir rätt. Alternativet är att slänga uppgiften.
 */
export function parseImportDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO, med eller utan tid. Tidsdelen kastas — registreringsdatum har ingen
  // klockslagsprecision, och att behålla den hade gjort "samma dag" beroende
  // av tidszon.
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (iso) return utcDate(+iso[1], +iso[2], +iso[3]);

  // Dag först: 14/3 2019, 14.03.2019, 3-4-2019
  const dmy = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (dmy) {
    const first = +dmy[1];
    const second = +dmy[2];
    const y = +dmy[3];
    // Dag först. Går den läsningen inte ihop (03/25/2019) står filen i
    // amerikansk ordning — läs den så i stället för att svara tomt.
    return utcDate(y, second, first) ?? utcDate(y, first, second);
  }

  // 20190314
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return utcDate(+compact[1], +compact[2], +compact[3]);

  // 2019-03 → 1 mars
  const ym = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (ym) return utcDate(+ym[1], +ym[2], 1);

  // Bara årtal
  const year = s.match(/^(\d{4})$/);
  if (year) return utcDate(+year[1], 1, 1);

  // Excels serienummer. Spannet 10000–60000 är 1927–2064 — snävt nog att inte
  // råka svälja ett årtal (fyra siffror) eller ett kompakt datum (åtta).
  const serial = s.match(/^(\d{5})(?:[.,]\d+)?$/);
  if (serial) {
    const n = +serial[1];
    if (n >= 10000 && n <= 60000) {
      return inRange(new Date(EXCEL_EPOCH_MS + n * 86400000));
    }
  }

  return null;
}

/** `2019-03-14`. Används i förhandsgranskningen och där datumet visas. */
export function formatImportDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}
