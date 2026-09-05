import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCallbacks } from "@/app/actions/callbacks";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Klockans data — som route handler, inte som server action.
 *
 * Båda klockorna (sidfältets `NotificationBell` och cockpitens `CallbackBell`)
 * pollade `listCallbacks` var sextionde sekund. Som server action ställde sig
 * varje pollning i App Routers enda, seriella åtgärdskö — samma kö som
 * säljarens egna åtgärder. En kall fråga i bakgrunden blockerade alltså
 * ⌘K, anteckningen och affärsrutan tills den var klar. Se
 * `/api/presence/route.ts` för hela resonemanget.
 *
 * Frågan är dessutom inte gratis: 288 öppna återkomster med join mot lead,
 * säljare och kontakt, två gånger i minuten per säljare.
 *
 * GET och inte POST: det här är en läsning, och den ska gå att cachea bort i
 * webbläsaren när fliken ligger dold.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(req.url).searchParams.get("scope") === "floor" ? "floor" : "mine";

  // `listCallbacks` avgör själv om säljaren får se golvet — en klient som ber
  // om "floor" utan att vara admin får sina egna rader tillbaka, inte ett fel.
  const res = await listCallbacks(scope);

  return NextResponse.json(res);
}
