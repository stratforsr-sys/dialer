import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordAttempt, type RecordAttemptInput } from "@/app/actions/dialer";
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
  const results: Array<{ key: string; ok: boolean; error?: string }> = [];

  for (const item of items) {
    try {
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
      };

      await recordAttempt(input);
      results.push({ key: item.idempotencyKey, ok: true });
    } catch (err) {
      // En post som fallerar får inte stoppa resten av kön — säljaren är
      // redan flera leads längre fram och kan inte göra om den ändå.
      results.push({
        key: item.idempotencyKey,
        ok: false,
        error: err instanceof Error ? err.message : "Okänt fel",
      });
    }
  }

  return NextResponse.json({
    written: results.filter((r) => r.ok).length,
    results,
  });
}
