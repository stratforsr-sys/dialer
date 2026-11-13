import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_USER_EMAIL } from "@/lib/system-user";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Vem som kan hålla ett möte, och vem som frågar — för mötesrutan i
 * notisklockan, som inte får listan från en sida.
 *
 * Route handler av samma skäl som `/api/callbacks`: klockan ligger också i
 * cockpiten, och en server action därifrån hade ställt sig i samma seriella kö
 * som säljarens dispositioner.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user as { id: string };
  const holders = await db.user.findMany({
    where: { email: { not: SYSTEM_USER_EMAIL } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ selfId: me.id, holders });
}
