import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Hållarens öppna möten i ett tidsfönster — för krockvarningen i mötesrutan.
 *
 * Route handler och inte server action: rutan frågar när säljaren byter dag
 * eller hållare medan kunden är kvar i luren, och en server action hade ställt
 * sig i samma seriella kö som cockpitens egna åtgärder (se
 * `/api/presence/route.ts`). En långsam fråga här får aldrig hålla upp en
 * disposition.
 *
 * Bolagsnamnet visas bara för den som har rätt att se mötet — admin, hållaren
 * eller den som bokade det. Andra ser att tiden är upptagen, inte hos vem.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user as { id: string; role?: string };

  const url = new URL(req.url);
  const holderId = url.searchParams.get("holderId") ?? "";
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  const exclude = url.searchParams.get("exclude");

  // Fönstret är en dag i rutan. Ett större fönster är ett fel hos anroparen
  // och får inte bli en fråga över hela tabellen.
  if (
    !holderId ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > 3 * 86_400_000
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Ett möte som börjar upp till åtta timmar före fönstret kan fortfarande
  // pågå i det (längden är högst 480 minuter).
  const rows = await db.meeting.findMany({
    where: {
      holderId,
      status: "BOOKED",
      scheduledAt: { gte: new Date(from.getTime() - 480 * 60_000), lt: to },
      ...(exclude ? { id: { not: exclude } } : {}),
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true,
      holderId: true,
      bookedById: true,
      lead: { select: { companyName: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  const admin = me.role === "ADMIN";
  return NextResponse.json({
    meetings: rows.map((r) => ({
      id: r.id,
      scheduledAt: r.scheduledAt.toISOString(),
      durationMin: r.durationMin,
      status: "BOOKED" as const,
      label:
        admin || r.holderId === me.id || r.bookedById === me.id
          ? r.lead.companyName
          : "Annat möte",
    })),
  });
}
