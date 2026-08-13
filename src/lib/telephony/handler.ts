/**
 * HTTP-lagret för växelns webhooks. Delas av alla routes under
 * /api/telephony/* och /api/webhooks/* så att integrationen fungerar oavsett
 * exakt vilken URL som råkade skrivas in i Lynes.
 *
 * Två saker styr designen, och båda kommer av att motparten är en växel:
 *
 *   1. Svaret måste komma snabbt och nästan alltid vara 200. En växel som får
 *      5xx försöker om — i värsta fall i all evighet, i bästa fall tills den
 *      stänger av webhooken helt. Därför: 200 så snart rådatat ligger nere,
 *      även om tolkningen efteråt misslyckades. Raden finns kvar och går att
 *      köra om. 5xx sparas till det enda fall där omleverans faktiskt hjälper:
 *      databasen var inte nåbar och ingenting skrevs.
 *   2. Allt loggas till konsolen med prefixet [lynes]. Det är det enda
 *      fönstret in i vad som händer innan någon byggt en vy — `vercel logs`
 *      visar direkt om leveranserna kommer fram, om nyckeln matchar och hur
 *      payloaden såg ut.
 */

import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/telephony/verify";
import { splitDeliveries } from "@/lib/telephony/normalize";
import { ingestEvent } from "@/lib/telephony/ingest";
import { db } from "@/lib/db";

/**
 * Tolkar body efter innehållstyp, men litar inte på den.
 *
 * Content-Type är fel förvånansvärt ofta hos telefonileverantörer — JSON
 * skickad som text/plain, formulärdata utan typ alls. Därför prövas JSON
 * först oavsett vad headern påstår, och formulärtolkning bara om det ser ut
 * som ett formulär.
 *
 * Går ingenting att tolka returneras `{ _rawText }`. Då hamnar innehållet
 * ändå i råloggen, vilket är hela poängen: en payload vi inte förstår är
 * information, inte skräp.
 */
function parseBody(rawBody: string, contentType: string | null): unknown {
  const body = rawBody.trim();
  if (!body) return {};

  if (body.startsWith("{") || body.startsWith("[")) {
    try {
      return JSON.parse(body);
    } catch {
      /* faller igenom */
    }
  }

  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("form-urlencoded") || (!body.includes("\n") && body.includes("="))) {
    try {
      const params = new URLSearchParams(body);
      const obj: Record<string, unknown> = {};
      // forEach och inte for-of: tsconfig sätter inget `target`, och att
      // itererera en URLSearchParams-iterator kräver då downlevelIteration.
      params.forEach((v, k) => {
        // Formulärfält bär ibland JSON i värdet — packa upp det så att
        // normaliseringen ser fälten i stället för en sträng.
        if (v.startsWith("{") || v.startsWith("[")) {
          try {
            obj[k] = JSON.parse(v);
            return;
          } catch {
            /* behåll som text */
          }
        }
        obj[k] = v;
      });
      if (Object.keys(obj).length > 0) return obj;
    } catch {
      /* faller igenom */
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    return { _rawText: body.slice(0, 20000) };
  }
}

/** Tar emot en leverans. */
export async function handleWebhookPost(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawBody = await request.text();

  const auth = verifyWebhook(request.headers, url, rawBody);
  if (!auth.ok) {
    // Loggas med både orsak och headernamn — men ALDRIG med några värden.
    // Den som felsöker behöver veta vilka headers som fanns; att skriva ut
    // vad de innehöll hade lagt en hemlighet i loggen.
    console.warn(
      `[lynes] 401 på ${url.pathname}: ${auth.detail ?? "okänd orsak"}`,
      `| content-type: ${request.headers.get("content-type") ?? "saknas"}`,
      `| body ${rawBody.length} tecken`
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseBody(rawBody, request.headers.get("content-type"));
  const deliveries = splitDeliveries(parsed);

  // Första gången ett format dyker upp vill man se det i sin helhet. Efter
  // det räcker sammanfattningen — men eftersom vi inte vet när "efter det"
  // är, loggas hela payloaden så länge den är liten. 4 kB räcker för en
  // samtalshändelse och är för lite för att fylla loggen.
  if (rawBody.length <= 4096) {
    console.log(`[lynes] payload (${auth.method}) ${url.pathname}: ${rawBody}`);
  } else {
    console.log(`[lynes] payload (${auth.method}) ${url.pathname}: ${rawBody.length} tecken, ${deliveries.length} händelser`);
  }

  const results = [];
  for (const delivery of deliveries) {
    try {
      const result = await ingestEvent(delivery, auth.method);
      results.push(result);
      console.log(
        `[lynes] ${result.duplicate ? "dubblett" : "sparad"} call=${result.callId ?? "?"} ` +
          `agent=${result.matched.agent} user=${result.matched.user} ` +
          `lead=${result.matched.lead} attempt=${result.matched.attempt}` +
          (result.error ? ` FEL: ${result.error}` : "")
      );
    } catch (err) {
      // Hit tar vi oss bara om databasen inte gick att skriva till alls.
      // Då — och bara då — är omleverans rätt svar.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[lynes] kunde inte spara händelsen: ${message}`);
      return NextResponse.json({ error: "Storage failed", detail: message }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok: true,
    received: results.length,
    stored: results.filter((r) => !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
  });
}

/**
 * GET på samma URL. Fyller tre syften:
 *
 *   1. Verifiering. Många webhook-gränssnitt gör ett GET mot adressen innan
 *      de sparar den, och vissa skickar en challenge som ska ekas tillbaka
 *      ordagrant som ren text. Utan det går webhooken inte att spara alls.
 *   2. Hälsokoll utan nyckel — ett enkelt "ja, jag finns".
 *   3. Insyn MED nyckel: ?recent=20 ger de senaste råpayloaderna. Det är så
 *      man ser vad Lynes faktiskt skickar innan någon vy finns byggd.
 */
export async function handleWebhookGet(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const challenge =
    url.searchParams.get("challenge") ??
    url.searchParams.get("hub.challenge") ??
    url.searchParams.get("verify_token") ??
    url.searchParams.get("validationToken");
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const recent = url.searchParams.get("recent");
  if (recent) {
    const auth = verifyWebhook(request.headers, url, "");
    if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const take = Math.min(Math.max(Number(recent) || 20, 1), 100);
    const [events, calls, agents] = await Promise.all([
      db.telephonyEvent.findMany({
        orderBy: { receivedAt: "desc" },
        take,
        select: {
          id: true,
          receivedAt: true,
          eventType: true,
          callId: true,
          authMethod: true,
          handled: true,
          error: true,
          rawJson: true,
        },
      }),
      db.telephonyCall.count(),
      db.telephonyAgent.findMany({
        orderBy: { lastSeenAt: "desc" },
        take: 50,
        select: {
          externalId: true,
          name: true,
          extension: true,
          email: true,
          userId: true,
          autoLinked: true,
          lastSeenAt: true,
        },
      }),
    ]);

    return NextResponse.json({ eventCount: events.length, callCount: calls, agents, events });
  }

  return NextResponse.json({
    ok: true,
    service: "lynes-telephony-webhook",
    method: "POST hit med JSON",
    secretConfigured: Boolean(process.env.LYNES_WEBHOOK_SECRET),
  });
}
