import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  const meetings = await db.meeting.findMany({
    where: {
      scheduledAt: { gte: yesterday, lte: endOfYesterday },
      outcome: "PENDING",
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      bookedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (meetings.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // Group by seller
  const byUser = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const userId = m.bookedById;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(m);
  }

  let sent = 0;

  for (const [, userMeetings] of Array.from(byUser.entries())) {
    const user = userMeetings[0].bookedBy;
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://localhost:3000";

    const rows = userMeetings.map((m: typeof meetings[number]) => {
      const time = new Date(m.scheduledAt).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#09090b;">${m.lead.companyName}</strong>
            ${m.title ? `<br><span style="color:#71717a;font-size:13px;">${m.title}</span>` : ""}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;color:#71717a;font-size:13px;">${time}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
            <div style="display:flex;gap:8px;">
              <a href="${baseUrl}/api/meeting-outcome?id=${m.id}&outcome=SHOW&token=${process.env.CRON_SECRET}"
                 style="display:inline-block;padding:6px 14px;background:#16a34a;color:white;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
                ✓ Show
              </a>
              <a href="${baseUrl}/api/meeting-outcome?id=${m.id}&outcome=NO_SHOW&token=${process.env.CRON_SECRET}"
                 style="display:inline-block;padding:6px 14px;background:#dc2626;color:white;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
                ✗ No-show
              </a>
              <a href="${baseUrl}/leads/${m.lead.id}"
                 style="display:inline-block;padding:6px 14px;background:#f4f4f5;color:#3f3f46;border-radius:6px;text-decoration:none;font-size:13px;">
                Öppna
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="max-width:600px;margin:40px auto;padding:0 20px;">

            <div style="background:white;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">

              <!-- Header -->
              <div style="padding:24px 24px 20px;border-bottom:1px solid #f4f4f5;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                  <div style="width:28px;height:28px;background:#16a34a;border-radius:7px;display:flex;align-items:center;justify-content:center;">
                    <span style="color:white;font-size:14px;">⚡</span>
                  </div>
                  <span style="font-weight:600;color:#09090b;">Sales Hub</span>
                </div>
                <h1 style="margin:0;font-size:20px;color:#09090b;font-weight:700;">
                  Gårdagens möten
                </h1>
                <p style="margin:6px 0 0;color:#71717a;font-size:14px;">
                  Hej ${user.name} — du hade ${userMeetings.length} möte${userMeetings.length > 1 ? "n" : ""} igår. Markera utfall:
                </p>
              </div>

              <!-- Table -->
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#fafafa;">
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Bolag</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Tid</th>
                    <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Utfall</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <!-- Footer -->
              <div style="padding:20px 24px;background:#fafafa;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:12px;color:#a1a1aa;">
                  Telink Sales Hub · Skickas varje morgon 08:00 mån–fre
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await resend.emails.send({
        from: "Sales Hub <noreply@telink.se>",
        to: user.email,
        subject: `${userMeetings.length} möte${userMeetings.length > 1 ? "n" : ""} att markera — ${new Date(yesterday).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}`,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send email to ${user.email}:`, err);
    }
  }

  return NextResponse.json({ sent, total: meetings.length });
}
