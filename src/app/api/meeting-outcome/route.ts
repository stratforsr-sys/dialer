import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyActionToken, escapeHtml } from "@/lib/action-token";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const outcome = searchParams.get("outcome");
  const token = searchParams.get("token");

  // Ordningen spelar roll: validera parametrarna FÖRE token, annars signeras
  // kontrollen mot värden som ännu inte är kända som giltiga.
  if (!id || !outcome || !["SHOW", "NO_SHOW"].includes(outcome)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  // Token är bundet till både mötet och utfallet — en Show-länk kan inte
  // återanvändas för No-show, och inte för något annat möte.
  if (!verifyActionToken(token, id, outcome)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meeting = await db.meeting.update({
    where: { id },
    data: { outcome: outcome as "SHOW" | "NO_SHOW" },
    include: { lead: true, bookedBy: { select: { id: true } } },
  });

  // Log activity
  await db.activity.create({
    data: {
      type: outcome === "SHOW" ? "MEETING_COMPLETED" : "MEETING_NO_SHOW",
      actorId: meeting.bookedBy.id,
      leadId: meeting.leadId,
      metadata: JSON.stringify({ outcome, via: "email" }),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const label = outcome === "SHOW" ? "✓ Show markerat!" : "✗ No-show markerat!";
  const color = outcome === "SHOW" ? "#16a34a" : "#dc2626";

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta http-equiv="refresh" content="3;url=${baseUrl}/leads/${meeting.leadId}">
    </head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#fafafa;">
    <div style="text-align:center;padding:40px;background:white;border-radius:16px;border:1px solid #e4e4e7;">
      <div style="font-size:48px;margin-bottom:16px;">${outcome === "SHOW" ? "✅" : "❌"}</div>
      <h2 style="color:${color};margin:0 0 8px;">${label}</h2>
      <p style="color:#71717a;font-size:14px;margin:0;">${escapeHtml(meeting.lead.companyName)}</p>
      <p style="color:#a1a1aa;font-size:12px;margin:16px 0 0;">Omdirigerar till lead...</p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
