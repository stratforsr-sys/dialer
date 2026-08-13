import { handleWebhookGet, handleWebhookPost } from "@/lib/telephony/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * /api/webhooks/* — samma mottagning under det andra namn man rimligen
 * gissar på. "webhook" är ett minst lika naturligt val som "telephony" när
 * man står i Lynes gränssnitt och ska skriva en URL, och att stödja båda
 * kostar en fil.
 */
export const POST = handleWebhookPost;
export const GET = handleWebhookGet;
