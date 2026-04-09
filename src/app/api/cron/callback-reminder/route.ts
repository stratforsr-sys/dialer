import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Window: callbacks due in the next 5-10 minutes (run cron every 5 min)
  const in5min = new Date(now.getTime() + 5 * 60 * 1000);
  const in10min = new Date(now.getTime() + 10 * 60 * 1000);

  const callbacks = await db.callback.findMany({
    where: {
      completedAt: null,
      scheduledAt: { gte: in5min, lte: in10min },
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (callbacks.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://localhost:3000";
  let sent = 0;

  for (const cb of callbacks) {
    const time = new Date(cb.scheduledAt).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="max-width:480px;margin:40px auto;padding:0 20px;">
            <div style="background:white;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
              <div style="padding:20px 24px;border-bottom:1px solid #f4f4f5;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                  <div style="width:28px;height:28px;background:#f97316;border-radius:7px;display:flex;align-items:center;justify-content:center;">
                    <span style="color:white;font-size:14px;">🔔</span>
                  </div>
                  <span style="font-weight:600;color:#09090b;">Sales Hub</span>
                </div>
                <h1 style="margin:0;font-size:18px;color:#09090b;font-weight:700;">
                  Återkomst om 5 minuter
                </h1>
                <p style="margin:6px 0 0;color:#71717a;font-size:14px;">
                  Hej ${cb.user.name} — dags att ringa!
                </p>
              </div>
              <div style="padding:20px 24px;">
                <div style="background:#f4f4f5;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                  <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#09090b;">${cb.lead.companyName}</p>
                  <p style="margin:0;color:#71717a;font-size:13px;">Planerad tid: ${time}</p>
                  ${cb.notes ? `<p style="margin:8px 0 0;color:#52525b;font-size:13px;font-style:italic;">"${cb.notes}"</p>` : ""}
                </div>
                <a href="${baseUrl}/leads/${cb.lead.id}"
                   style="display:inline-block;padding:10px 20px;background:#09090b;color:white;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                  Öppna lead →
                </a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await resend.emails.send({
        from: "Sales Hub <noreply@telink.se>",
        to: cb.user.email,
        subject: `🔔 Återkomst om 5 min — ${cb.lead.companyName}`,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send callback reminder to ${cb.user.email}:`, err);
    }
  }

  return NextResponse.json({ sent, total: callbacks.length });
}
