/**
 * Normalisering av svenska telefonnummer till E.164.
 *
 * Utan detta går ett inkommande samtal inte att matcha mot ett lead: numret i
 * databasen är fritext från en CSV ("070-123 45 67", "+46 70 1234567",
 * "0701234567") medan växeln levererar "+46701234567". Callback-fångst,
 * spärrlista och dubblettkontroll bygger alla på att numren är jämförbara.
 *
 * Rena funktioner utan beroenden — går att köra i både klient och server.
 */

/** Svenska mobilprefix (utan inledande nolla). */
const MOBILE_PREFIXES = ["70", "72", "73", "76", "79"];

/**
 * Normaliserar till E.164, eller null om numret inte går att tolka.
 *
 * Returnerar hellre null än ett gissat nummer: ett felaktigt normaliserat
 * nummer leder till att fel lead poppar upp på skärmen vid ett inkommande
 * samtal, vilket är värre än att inget poppar upp alls.
 */
export function toE164(raw: string | null | undefined, defaultCountry = "46"): string | null {
  if (!raw) return null;

  // Behåll inledande + men rensa allt annat som inte är siffror. Vanliga
  // skräptecken i importerade filer: mellanslag, bindestreck, parenteser,
  // punkter, hårda blanksteg.
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;

  // 00 som internationellt prefix → +
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    return validate(`+${digits}`);
  }

  if (hasPlus) return validate(`+${digits}`);

  // Landsnummer utan plus: "46701234567", "468394630".
  //
  // Tvetydighet värd att känna till: 046 är riktnumret till Lund, så ett
  // nummer som börjar på "46" utan inledande nolla kan i teorin vara Lund
  // skrivet utan nollan. Total längd skiljer dem åt i praktiken — svenska
  // nummer med landsnummer landar på 9–11 siffror, medan Lund utan nolla
  // skulle bli 8–9. Överlappet på 9 tolkas som landsnummer, vilket är rätt
  // för importerad data där resten av kolumnen redan är på +46-format.
  if (
    digits.startsWith(defaultCountry) &&
    digits.length >= 9 &&
    digits.length <= 11
  ) {
    return validate(`+${digits}`);
  }

  // Nationellt format med inledande nolla: "0701234567" → "+46701234567"
  if (digits.startsWith("0")) {
    return validate(`+${defaultCountry}${digits.slice(1)}`);
  }

  // Nummer utan nolla och utan landsnummer går inte att tolka entydigt.
  // Ett åttasiffrigt "12345678" kan vara vad som helst — gissa inte.
  return null;
}

/**
 * Grov rimlighetskontroll. Syftet är att fånga trasig indata (avhuggna
 * nummer, orgnummer i telefonkolumnen), inte att validera mot nummerplanen.
 */
function validate(e164: string): string | null {
  const digits = e164.slice(1);
  if (digits.length < 8 || digits.length > 15) return null;
  if (/^0+$/.test(digits)) return null;
  return e164;
}

/** Är det ett svenskt mobilnummer? Styr vilket nummer som ringes först. */
export function isSwedishMobile(e164: string | null): boolean {
  if (!e164?.startsWith("+46")) return false;
  const national = e164.slice(3);
  return MOBILE_PREFIXES.some((p) => national.startsWith(p));
}

/** Läsbart format för skärmen: +46701234567 → 070-123 45 67 */
export function formatSwedish(e164: string | null): string {
  if (!e164) return "";
  if (!e164.startsWith("+46")) return e164;

  const n = `0${e164.slice(3)}`;
  if (n.length === 10) {
    // Mobil: 070-123 45 67
    return `${n.slice(0, 3)}-${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
  }
  if (n.length === 9) {
    // Fast, tvåsiffrigt riktnummer: 08-123 45 67
    return `${n.slice(0, 2)}-${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  return n;
}
