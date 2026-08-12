import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, emailEnabled } from "@/lib/email/send";
import { callbackReminderEmail, type ReminderRow } from "@/lib/email/callback-reminder";
import { startOfDay, endOfDay, isSameDay } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Morgonmejlet med dagens återkomster.
 *
 * Kallas av Vercel Cron med CRON_SECRET som bearer. Routen ligger utanför
 * middleware (den har ingen sessionskaka) och gör därför sin egen kontroll.
 *
 * Två regler bär hela jobbet:
 *
 * 1. **Bara ikryssade.** `emailReminder = true` är enda vägen in i ett mejl.
 *    En påminnelse som kommer på allt är samma sak som ingen påminnelse alls —
 *    säljaren slutar öppna mejlet inom en vecka. Har man inga ikryssade
 *    återkomster idag skickas ingenting; ett tomt mejl är brus.
 *
 * 2. **Dygnet är svenskt, inte UTC.** Vercel kör i UTC, och "idag" i UTC hade
 *    lagt varje bokning efter klockan 22 på fel dag. Se `src/lib/time.ts`.
 *
 * Skyddet mot dubbelutskick är `emailSentAt`: en rad som redan mejlats idag
 * hoppas över, så att en manuell körning ovanpå cron-körningen inte ger två
 * mejl. Missade rader mejlas därför en gång per dag tills de ringts eller
 * avbokats — det är avsikten. Ett brutet löfte ska fortsätta göra ont.
 *
 * Kör för hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://dialer-five.vercel.app/api/cron/callback-reminders?dry=1"
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dry = searchParams.get("dry") === "1";

  if (!dry && !emailEnabled()) {
    // Inte ett fel: funktionen är avstängd tills nycklarna sätts, och jobbet
    // ska kunna vara schemalagt i en miljö där den är det.
    return NextResponse.json({
      skipped: "RESEND_API_KEY eller EMAIL_FROM saknas — inga mejl skickade",
    });
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  // Missade längre bak än så är inte längre en påminnelse utan en anklagelse.
  const overdueFloor = new Date(dayStart.getTime() - 30 * 86_400_000);

  const pending = await db.callback.findMany({
    where: {
      status: "PENDING",
      emailReminder: true,
      scheduledAt: { gte: overdueFloor, lte: dayEnd },
    },
    select: {
      id: true,
      scheduledAt: true,
      note: true,
      emailSentAt: true,
      leadId: true,
      sellerId: true,
      seller: { select: { id: true, name: true, email: true } },
      lead: { select: { companyName: true } },
      contact: {
        select: {
          name: true,
          directPhoneE164: true,
          directPhone: true,
          switchboardE164: true,
          switchboard: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Redan mejlade idag hoppas över — men bara de. En rad som mejlades igår
  // och fortfarande är oringd ska med igen.
  const due = pending.filter(
    (c) => !c.emailSentAt || !isSameDay(c.emailSentAt, now)
  );

  const appUrl =
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://dialer-five.vercel.app";

  // Gruppera per säljare — ett mejl per person, inte ett per återkomst.
  const bySeller = new Map<
    string,
    { name: string; email: string; ids: string[]; rows: ReminderRow[] }
  >();

  for (const c of due) {
    if (!c.seller.email) continue;
    let bucket = bySeller.get(c.sellerId);
    if (!bucket) {
      bucket = { name: c.seller.name, email: c.seller.email, ids: [], rows: [] };
      bySeller.set(c.sellerId, bucket);
    }
    bucket.ids.push(c.id);
    bucket.rows.push({
      companyName: c.lead.companyName,
      contactName: c.contact?.name ?? null,
      phone:
        c.contact?.directPhoneE164 ??
        c.contact?.directPhone ??
        c.contact?.switchboardE164 ??
        c.contact?.switchboard ??
        null,
      scheduledAt: c.scheduledAt,
      note: c.note,
      overdue: c.scheduledAt < dayStart,
      leadUrl: `${appUrl}/leads/${c.leadId}`,
    });
  }

  const results: Array<{
    seller: string;
    callbacks: number;
    overdue: number;
    sent: boolean;
    error?: string;
  }> = [];

  // Array.from och inte for...of över Mapen: tsconfig siktar på es5 och
  // iteratorer över Map kräver downlevelIteration, som inte är påslaget.
  for (const bucket of Array.from(bySeller.values())) {
    const overdueCount = bucket.rows.filter((r) => r.overdue).length;

    if (dry) {
      results.push({
        seller: bucket.email,
        callbacks: bucket.rows.length,
        overdue: overdueCount,
        sent: false,
      });
      continue;
    }

    const mail = callbackReminderEmail({
      sellerName: bucket.name,
      rows: bucket.rows,
      now,
      appUrl,
    });

    const res = await sendEmail({
      to: bucket.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    // Bokförs bara när mejlet faktiskt gick fram. En rad som markerats som
    // skickad efter ett misslyckat utskick får aldrig ett nytt försök.
    if (res.sent) {
      await db.callback.updateMany({
        where: { id: { in: bucket.ids } },
        data: { emailSentAt: new Date() },
      });
    }

    results.push({
      seller: bucket.email,
      callbacks: bucket.rows.length,
      overdue: overdueCount,
      sent: res.sent,
      error: res.error,
    });
  }

  return NextResponse.json({
    dry,
    day: dayStart.toISOString(),
    candidates: pending.length,
    due: due.length,
    sellers: results.length,
    results,
  });
}
