import { handleWebhookGet, handleWebhookPost } from "@/lib/telephony/handler";

// Nodejs och inte edge: verifieringen använder node:crypto, och Prisma via
// libsql-adaptern går inte att köra på edge-runtimen.
export const runtime = "nodejs";
// Ingen cachning. En cachead webhook svarar 200 utan att någonsin skriva en
// rad, och felet ser ut som att växeln aldrig ringde.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lynes samtalshändelser.
 *
 * Kanonisk adress:  POST https://dialer-five.vercel.app/api/telephony/lynes
 *
 * Routen är undantagen från middleware (se matchern i src/middleware.ts) och
 * gör därför sin egen autentisering — precis som cron-jobben. Nyckeln är
 * LYNES_WEBHOOK_SECRET och får skickas som bearer, som egen header, som
 * HMAC-signatur eller som query-parameter; se src/lib/telephony/verify.ts.
 */
export const POST = handleWebhookPost;
export const GET = handleWebhookGet;
