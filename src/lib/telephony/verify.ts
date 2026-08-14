/**
 * Autentisering av inkommande webhooks från växeln.
 *
 * Problemet: Lynes dokumenterar inte hur den skickar sin hemlighet. Det finns
 * fyra vanliga sätt, och att välja fel betyder att varenda leverans avvisas
 * med 401 — vilket i praktiken ser ut som att integrationen inte finns.
 *
 * Lösningen är att acceptera alla fyra och SKRIVA NER vilket som matchade.
 * Det är avsiktligt bredare än vad som är önskvärt i längden: så fort första
 * riktiga leveransen kommit in går det att läsa `TelephonyEvent.authMethod`,
 * se vad Lynes faktiskt använder, och strypa listan till det enda sättet.
 * Bredden är alltså en tillfällig upptäcktsmekanism, inte en slutgiltig
 * säkerhetsmodell — och den är noterad som en öppen punkt i arbetsloggen.
 *
 * Säkerheten som INTE ger vika under tiden:
 *   - Alla jämförelser är konstant tid. En vanlig `===` på en hemlighet läcker
 *     hur många tecken som stämde, och en angripare som kan mäta det gissar
 *     sig fram tecken för tecken.
 *   - Saknas LYNES_WEBHOOK_SECRET avvisas allt. Aldrig "ingen nyckel satt =
 *     släpp igenom", som är hur öppna webhook-endpoints brukar uppstå.
 *   - Query-parametern accepteras men rankas sist och märks som svagast i
 *     loggen: URL:er hamnar i proxyloggar och webbläsarhistorik på ett sätt
 *     som headers inte gör.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type AuthMethod =
  | "bearer"
  | "header-secret"
  | "hmac-sha256"
  | "query-param"
  | "none";

export interface VerifyResult {
  ok: boolean;
  method: AuthMethod;
  /** Sätts bara vid avslag, och loggas — aldrig i svaret till klienten. */
  detail?: string;
}

/** Jämför två strängar utan att läcka var de börjar skilja sig. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual kastar på olika längd, vilket i sig läcker längden. Att
  // längden på en hemlighet läcker är ofarligt; att jämförelsen kastar är det
  // inte, så längdkontrollen görs först och explicit.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Headers som kan bära en delad hemlighet rakt av. */
const SECRET_HEADERS = [
  "x-webhook-secret",
  "x-webhook-token",
  "x-api-key",
  "x-auth-token",
  "x-lynes-secret",
  "x-lynes-token",
  "x-lynes-key",
  "x-secret",
  "x-token",
];

/** Headers som kan bära en HMAC-signatur över rå body. */
const SIGNATURE_HEADERS = [
  "x-lynes-signature",
  "x-webhook-signature",
  "x-hub-signature-256",
  "x-signature-256",
  "x-signature",
  "signature",
];

/**
 * Signaturen kan komma i hex eller base64, med eller utan `sha256=`-prefix.
 * Alla fyra kombinationer prövas mot samma HMAC — det är billigt och tar bort
 * en hel klass av "fungerar inte och ingen vet varför".
 */
function hmacMatches(secret: string, rawBody: string, provided: string): boolean {
  const value = provided.trim().replace(/^sha256[=\s]/i, "").trim();
  if (!value) return false;

  const mac = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const candidates = [mac.toString("hex"), mac.toString("base64")];

  return candidates.some((c) => safeEqual(c.toLowerCase(), value.toLowerCase()));
}

/**
 * Prövar samtliga sätt och returnerar det första som håller.
 *
 * `rawBody` MÅSTE vara exakt de byte som kom över tråden. En JSON.parse följd
 * av JSON.stringify ändrar blanksteg och nyckelordning, och då stämmer aldrig
 * en HMAC — det är det klassiska felet i webhook-verifiering.
 */
export function verifyWebhook(
  headers: Headers,
  url: URL,
  rawBody: string,
  secret: string | undefined = process.env.LYNES_WEBHOOK_SECRET
): VerifyResult {
  if (!secret) {
    return { ok: false, method: "none", detail: "LYNES_WEBHOOK_SECRET saknas i miljön" };
  }

  // 1. Authorization: Bearer <nyckel> — och även "Authorization: <nyckel>"
  //    utan schema, vilket förvånansvärt många växlar skickar.
  const auth = headers.get("authorization");
  if (auth) {
    const bare = auth.replace(/^(Bearer|Token|ApiKey)\s+/i, "").trim();
    if (safeEqual(bare, secret)) return { ok: true, method: "bearer" };
  }

  // 2. Hemligheten rakt av i en egen header.
  for (const name of SECRET_HEADERS) {
    const v = headers.get(name);
    if (v && safeEqual(v.trim(), secret)) return { ok: true, method: "header-secret" };
  }

  // 3. HMAC-SHA256 över rå body.
  for (const name of SIGNATURE_HEADERS) {
    const v = headers.get(name);
    if (v && hmacMatches(secret, rawBody, v)) return { ok: true, method: "hmac-sha256" };
  }

  // Query-parametern är BORTTAGEN. Den fanns med som upptäcktsmekanism medan
  // det var okänt hur Lynes skickar sin nyckel. Det är det inte längre: första
  // riktiga leveransen kom med `Authorization: Bearer`, verifierat i
  // TelephonyEvent.authMethod. En hemlighet i URL:en hamnar i proxyloggar och
  // referrers och ska inte ligga kvar när den bevisligen inte behövs.
  //
  // Bearer, egen header och HMAC står kvar: alla tre är header-burna och
  // kostar ingenting, och de täcker att Lynes byter mekanism för andra
  // händelsetyper utan att förvarna.

  // forEach och inte spread: tsconfig sätter inget `target`, och att sprida
  // en Headers-iterator kräver då downlevelIteration.
  const seen: string[] = [];
  headers.forEach((_value, name) => {
    if (name.startsWith("x-") || name === "authorization") seen.push(name);
  });

  return {
    ok: false,
    method: "none",
    detail: `ingen matchande nyckel. Headers som kunde burit en: ${seen.join(", ") || "inga"}`,
  };
}
