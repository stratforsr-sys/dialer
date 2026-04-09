import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const count = await db.callback.count({
      where: {
        completedAt: null,
        scheduledAt: { gte: new Date() },
        userId: user.id,
      },
    });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
