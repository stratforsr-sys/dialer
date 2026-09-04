import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAttempt, markNoPhoneFound, type RecordAttemptInput } from "@/app/actions/dialer";
import type { CallResult, ConversationOutcome, NoReason, FrameworkStep } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Skrivkö för dispositioner.
 *
 * Varför en Route Handler och inte en server action: en server action svarar
 * med en omrenderad RSC-payload för den aktuella sidan. Cockpit är
 * `force-dynamic`, så varje tangenttryckning skulle dra igång sidans alla
 * frågor på nytt — vilket var den enskilt största fördröjningen i den gamla
 * implementationen. Här är svaret ett tomt JSON-objekt.
 *
 * Klienten går vidare till nästa lead OMEDELBART och lägger skrivningen i en
 * kö som töms i bakgrunden. Rätten att jobba leadet är redan avgjord av
 * arbetslåset, så det finns inget att vänta på. Med `keepalive` överlever
 * kön att fliken stängs mitt i.
 */

interface QueuedItem {
  idempotencyKey: string;
  leadId: string;
  /**
   * Vad posten är. `"noPhoneFound"` är ingen disposition — inget samtal
   * ringdes — men den delar kö med dispositionerna med flit.
   *
   * Fram till 2026-08-26 gick den vägen förbi kön, som ett direktanrop med
   * `.catch(() => {})` i tre olika lägen. Det gjorde systemets enda
   * oåterkalleliga åtgärd till dess enda oskyddade: ett nätverksglapp, en
   * utgången session eller ett serverfel svaldes tyst, bolaget låg kvar, och
   * säljaren hade redan sett bekräftelsen försvinna från skärmen. Nästa pass
   * fick samma bolag igen och nästa säljare gjorde om samma uppslagning.
   *
   * Här får den samma garantier som allt annat säljaren trycker på: omförsök
   * vid nätverksfel, `keepalive` när fliken stängs, och en synlig remsa när
   * det ändå inte gick.
   */
  kind?: "disposition" | "noPhoneFound";
  contactId?: string | null;
  listId?: string | null;
  sessionId?: string | null;
  result: CallResult;
  outcome?: ConversationOutcome | null;
  noReason?: NoReason | null;
  note?: string | null;
  idleBeforeSec?: number;
  durationSec?: number;
  dialedE164?: string | null;
  scriptVersionId?: string | null;
  callbackAt?: string | null;
  callbackNote?: string | null;
  callbackEmailReminder?: boolean;
  /** Återkomsten dispositionen svarar på, när den sker i notisklockan. */
  answeredCallbackId?: string | null;
  gatekeeper?: {
    name?: string | null;
    role?: string | null;
    said?: string | null;
    dmName?: string | null;
    dmAvailability?: string | null;
    dmAvailableAt?: string | null;
    passed?: boolean;
  } | null;
  framework?: {
    furthestStep: FrameworkStep;
    endedAtStep: FrameworkStep;
    closeAttempts?: number;
    objections?: Array<{ tag: string; atStep: FrameworkStep; handled?: boolean }>;
  } | null;
}

/**
 * Går felet att försöka igen?
 *
 * **Förvalet är ja**, och det är medvetet. Skrivningen är idempotent på
 * `idempotencyKey` (migration 027), så ett omförsök av något som redan lyckats
 * kostar ett uppslag och svarar "redan gjort". Ett omförsök som är onödigt är
 * alltså billigt, medan ett uteblivet omförsök kostar ett samtal — och den 4
 * september kostade det tio återkomster och två kundlöften.
 *
 * Undantagen är fel som aldrig kan bli något annat hur många gånger de än
 * skickas. Att skicka om dem hade varit en tyst loop mot en vägg, och kön har
 * ett tak på antal försök just för att en felklassning inte ska bli oändlig.
 *
 * `noPhoneFound` skickas aldrig om, oavsett fel: den raderar leadet och har
 * ingen idempotensnyckel att luta sig mot. Ett omförsök efter en halvvägs
 * lyckad körning hade antingen kastat `Forbidden` (leadet är borta) eller lagt
 * en andra rad i aktivitetsloggen, som är oföränderlig.
 */
function isRetryable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return true;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };

  // Behörighet. Leadet är inte säljarens att skriva på, och blir det inte.
  if (e.name === "ForbiddenError") return false;

  const message = typeof e.message === "string" ? e.message : "";
  if (message.startsWith("Forbidden:")) return false;

  // Fel vi kastar själva när indata inte går ihop. Samma indata igen ger
  // samma svar.
  const PERMANENTA = [
    "Lead not found",
    "DialerConfig saknas",
    "Ogiltig tidpunkt",
    "Välj varför kunden sa nej",
  ];
  if (PERMANENTA.some((m) => message.includes(m))) return false;

  // Prismas deterministiska fel: unikhet, främmande nyckel, rad saknas.
  // (En krock på `idempotencyKey` når aldrig hit — `recordAttempt` tolkar den
  // som "redan gjort" och returnerar normalt.)
  if (e.code === "P2002" || e.code === "P2003" || e.code === "P2025") return false;

  // Allt annat — timeout, tappad anslutning, okänt — är värt ett nytt försök.
  return true;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let items: QueuedItem[];
  try {
    const body = await req.json();
    items = Array.isArray(body?.items) ? body.items : [];
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (items.length === 0) return NextResponse.json({ written: 0, results: [] });
  if (items.length > 50) {
    return NextResponse.json({ error: "För många poster i en batch" }, { status: 413 });
  }

  // Sekventiellt, inte parallellt: varje post läser leadets aktuella
  // attemptCount och skriver tillbaka ett nytt. Parallella skrivningar mot
  // samma lead skulle ge två försök med samma löpnummer.
  const results: Array<{ key: string; ok: boolean; error?: string; retryable?: boolean }> = [];

  for (const item of items) {
    try {
      if (item.kind === "noPhoneFound") {
        await markNoPhoneFound(item.leadId);
        results.push({ key: item.idempotencyKey, ok: true });
        continue;
      }

      // Nyckeln följer med in i skrivningen. Den är hela skälet till att kön
      // vågar skicka om posten: `recordAttempt` slår upp den först och svarar
      // "redan gjort" i stället för att skriva ett andra samtal.

      const input: RecordAttemptInput = {
        leadId: item.leadId,
        contactId: item.contactId ?? null,
        listId: item.listId ?? null,
        sessionId: item.sessionId ?? null,
        result: item.result,
        outcome: item.outcome ?? null,
        noReason: item.noReason ?? null,
        note: item.note ?? null,
        idleBeforeSec: item.idleBeforeSec,
        durationSec: item.durationSec,
        dialedE164: item.dialedE164 ?? null,
        scriptVersionId: item.scriptVersionId ?? null,
        callbackAt: item.callbackAt ? new Date(item.callbackAt) : null,
        callbackNote: item.callbackNote ?? null,
        callbackEmailReminder: item.callbackEmailReminder === true,
        answeredCallbackId: item.answeredCallbackId ?? null,
        gatekeeper: item.gatekeeper
          ? {
              ...item.gatekeeper,
              dmAvailableAt: item.gatekeeper.dmAvailableAt
                ? new Date(item.gatekeeper.dmAvailableAt)
                : null,
            }
          : null,
        framework: item.framework ?? null,
        idempotencyKey: item.idempotencyKey,
      };

      await recordAttempt(input);
      results.push({ key: item.idempotencyKey, ok: true });
    } catch (err) {
      // En post som fallerar får inte stoppa resten av kön — säljaren är
      // redan flera leads längre fram och kan inte göra om den ändå.
      //
      // `retryable` avgör om kön skickar om posten eller ger upp och visar
      // remsan. Ett omförsök av något som aldrig kan lyckas är en tyst loop;
      // ett uppgivet försök på något som bara timade ut är ett förlorat samtal.
      results.push({
        key: item.idempotencyKey,
        ok: false,
        error: err instanceof Error ? err.message : "Okänt fel",
        retryable: item.kind === "noPhoneFound" ? false : isRetryable(err),
      });
    }
  }

  return NextResponse.json({
    written: results.filter((r) => r.ok).length,
    results,
  });
}
