import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { heartbeat } from "@/app/actions/presence";
import type { PresenceStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Säljarens hjärtslag — som route handler, inte som server action.
 *
 * ## Server actions delar EN kö, och den är strikt seriell
 *
 * App Routers klient håller en enda `actionQueue`. Ligger en åtgärd och väntar
 * läggs nästa sist i kön och startar först när den föregående är klar
 * (`next/dist/shared/lib/router/action-queue.js`: *"The queue is not empty, so
 * add the action to the end of the queue"*). Kön är gemensam för **alla** server
 * actions på sidan.
 *
 * I cockpiten betyder det att bakgrundens pollningar och säljarens egna
 * åtgärder står i samma kö: `heartbeat` var 15:e sekund, båda klockornas
 * `listCallbacks` var 60:e, `renewLeases` var 5:e minut — och bakom dem
 * `saveCockpitNote`, `createDeal`, `leaseSpecificLead` (⌘K och klockan) och
 * påfyllningen av däcket.
 *
 * Turso går kall mellan anropen och läser ~3 400 rader/sekund kall. En pollning
 * som landar på en kall instans tar sekunder till tiotals sekunder — och under
 * hela den tiden händer ingenting när säljaren trycker. Det är den
 * "allt hänger"-känsla som rapporterades, och den är intermittent av exakt
 * samma skäl som kylan är det.
 *
 * Dispositionerna flyttades hit tidigare av ett besläktat skäl, och det är
 * därför just de fortsatte fungera medan resten kändes fruset.
 *
 * **Det handlar alltså inte om omrendering.** En server action renderar bara om
 * sidan när den revaliderat en sökväg (`skipFlight` i Next's `action-handler`),
 * och ingen av pollningarna gör det. Kostnaden är kön, inte renderingen.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    status?: PresenceStatus;
    leadId?: string | null;
    companyName?: string | null;
    listId?: string | null;
    listName?: string | null;
    sessionId?: string | null;
    callsDelta?: number;
    soldDelta?: number;
    talkSecDelta?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await heartbeat({
    status: body.status ?? "DIALING",
    leadId: body.leadId ?? null,
    companyName: body.companyName ?? null,
    listId: body.listId ?? null,
    listName: body.listName ?? null,
    sessionId: body.sessionId ?? null,
    callsDelta: body.callsDelta,
    soldDelta: body.soldDelta,
    talkSecDelta: body.talkSecDelta,
  });

  // Räknarna läses av chefsvyn, aldrig av avsändaren. Ett tomt svar håller
  // payloaden på noll och gör hjärtslaget så billigt som det ska vara.
  return NextResponse.json({ ok: true });
}
