import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Siffran bredvid "Möten" i sidomenyn: mina möten som saknar utfall.
 *
 * Bara de som SAKNAR utfall — inte kommande. En siffra som lyser för allt som
 * står i kalendern slutar betyda något inom en vecka; den här ska bara lysa
 * när något väntar på mig. "Mina" = jag håller det. Den som bokade ser sina
 * på /meetings, men räknaren ska inte dubbla en uppgift som hållaren äger.
 *
 * Hämtas när sidan byts, inte på en timer — den kostar ett indexuppslag
 * (`holderId, status, scheduledAt`) och ska inte väcka Neon i onödan.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user as { id: string };
  const now = new Date();

  // Sluttiden är start + längd, och längden varierar per rad — därför ett
  // grovt urval i frågan (startat) och det exakta villkoret här.
  const started = await db.meeting.findMany({
    where: { holderId: me.id, status: "BOOKED", scheduledAt: { lte: now } },
    select: { scheduledAt: true, durationMin: true },
    take: 200,
  });
  const awaiting = started.filter(
    (m) => m.scheduledAt.getTime() + m.durationMin * 60_000 <= now.getTime()
  ).length;

  return NextResponse.json({ awaiting });
}
