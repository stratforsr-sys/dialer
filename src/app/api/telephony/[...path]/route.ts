import { handleWebhookGet, handleWebhookPost } from "@/lib/telephony/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Allt annat under /api/telephony/*.
 *
 * Finns för att adressen som skrevs in i Lynes inte behöver vara exakt den vi
 * tänkte oss. En webhook som pekar på /api/telephony/lynes-webhook eller
 * /api/telephony/calls ska fungera i stället för att svara 404 — 404:an syns
 * nämligen bara hos Lynes, och den som konfigurerade den ser ingenting alls i
 * dialern som förklarar tystnaden.
 *
 * Den namngivna routen /api/telephony/lynes vinner över den här: statiska
 * segment går före catch-all i Next.js routing.
 *
 * Samma nyckelkontroll som överallt annars — bredden gäller adressen, inte
 * behörigheten.
 */
export const POST = handleWebhookPost;
export const GET = handleWebhookGet;
