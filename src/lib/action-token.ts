import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signerade engångslänkar för åtgärder som utförs från e-post, utan inloggning.
 *
 * Tidigare mejlades CRON_SECRET ut i klartext i varje mötespåminnelse. Den som
 * fick mejlet hade därmed nyckeln till cron-endpointen, och eftersom token inte
 * var bundet till mötet fungerade samma länk mot vilket möte som helst.
 *
 * Nu signeras varje länk över (resurs, åtgärd, utgångstid) med en egen nyckel
 * som aldrig delas med cron-jobbet.
 */

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dygn — mejlet ska hinna läsas

function secret(): string {
  // Egen nyckel om den finns; annars NEXTAUTH_SECRET, som ändå aldrig lämnar
  // servern. Poängen är att den skiljer sig från CRON_SECRET.
  const s = process.env.ACTION_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("ACTION_TOKEN_SECRET eller NEXTAUTH_SECRET saknas");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Token för en specifik åtgärd på en specifik resurs. Format: `<exp>.<sig>`. */
export function createActionToken(
  resourceId: string,
  action: string,
  expiresAt: number = Date.now() + TTL_MS
): string {
  const exp = Math.floor(expiresAt / 1000);
  return `${exp}.${sign(`${resourceId}:${action}:${exp}`)}`;
}

/**
 * Verifierar token mot exakt den resurs och åtgärd som anropas. Ett token för
 * möte A och SHOW går alltså inte att använda på möte B eller på NO_SHOW.
 */
export function verifyActionToken(
  token: string | null,
  resourceId: string,
  action: string
): boolean {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const exp = Number(token.slice(0, dot));
  const provided = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  const expected = sign(`${resourceId}:${action}:${exp}`);
  // Hex av samma HMAC har alltid samma längd; ojämn längd = ogiltigt token.
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** Minimal HTML-escape för värden som interpoleras i mejl och svarssidor. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
