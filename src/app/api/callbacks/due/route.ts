import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const now = new Date();
    const in35min = new Date(now.getTime() + 35 * 60 * 1000);

    const callbacks = await db.callback.findMany({
      where: {
        completedAt: null,
        scheduledAt: { gte: now, lte: in35min },
        userId: user.id,
      },
      include: {
        lead: { select: { id: true, companyName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json(callbacks);
  } catch {
    return NextResponse.json([]);
  }
}
