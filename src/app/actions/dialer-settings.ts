"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Reglagen för uppföljningsmotorn.
 *
 * Taket och vilotiden är de två siffror som avgör hur många dagar databasen
 * räcker. Med 2169 leads och 5–10 säljare är 4 försök × 2169 = 8676 samtal,
 * vilket ett golv på sju personer betar av på 8–12 arbetsdagar. Därför ligger
 * de här och inte i koden — de ska gå att justera när verkligheten visar sig.
 */

export async function updateDialerConfig(input: {
  maxAttempts: number;
  cooldownDays: number;
  leaseMinutes: number;
  leaseBlockSize: number;
  retryHoursNoAnswer: number;
  retryHoursBusy: number;
  retryHoursVoicemail: number;
  retryHoursGatekeeper: number;
  retryDaysNoSalespeople: number;
  retryDaysNo: number;
  targetCallsPerHour: number;
  idleAlertMinutes: number;
  blockedDates: string[];
}) {
  await requireAdmin();

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.trunc(n)));

  await db.dialerConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {
      maxAttempts: clamp(input.maxAttempts, 1, 30),
      cooldownDays: clamp(input.cooldownDays, 1, 365),
      leaseMinutes: clamp(input.leaseMinutes, 2, 120),
      leaseBlockSize: clamp(input.leaseBlockSize, 5, 100),
      retryHoursNoAnswer: clamp(input.retryHoursNoAnswer, 1, 720),
      retryHoursBusy: clamp(input.retryHoursBusy, 1, 720),
      retryHoursVoicemail: clamp(input.retryHoursVoicemail, 1, 720),
      retryHoursGatekeeper: clamp(input.retryHoursGatekeeper, 1, 720),
      retryDaysNoSalespeople: clamp(input.retryDaysNoSalespeople, 1, 365),
      // Golvet är 7 dagar, inte 1. Fältet styr hur snart en kund som tackat
      // nej får höra från oss igen, och den enda siffra som orsakat ett
      // problem i produktionen är en för LÅG — 20 timmar, som gav samtal
      // dagen efter ett nej. Ett oavsiktligt "1" här hade återskapat exakt
      // den buggen genom inställningssidan.
      retryDaysNo: clamp(input.retryDaysNo, 7, 365),
      targetCallsPerHour: clamp(input.targetCallsPerHour, 1, 200),
      idleAlertMinutes: clamp(input.idleAlertMinutes, 5, 240),
      // Bara giltiga datum sparas — ett trasigt värde här skulle annars tyst
      // spärra ingenting alls.
      blockedDatesJson: JSON.stringify(
        input.blockedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
      ),
    },
  });

  revalidatePath("/admin/dialer");
  return { ok: true };
}

export async function saveSlots(
  slots: Array<{ id?: string; name: string; startMinute: number; endMinute: number; order: number; active: boolean }>
) {
  await requireAdmin();

  // Pass med befintligt id uppdateras i stället för att ersättas — CallAttempt
  // pekar på dem, och statistiken per pass ska överleva en namnändring.
  const existing = await db.callSlot.findMany({ select: { id: true } });
  const keep = new Set(slots.map((s) => s.id).filter(Boolean) as string[]);

  const ops = [
    ...slots.map((s) =>
      s.id
        ? db.callSlot.update({
            where: { id: s.id },
            data: {
              name: s.name,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              order: s.order,
              active: s.active,
            },
          })
        : db.callSlot.create({
            data: {
              name: s.name,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              order: s.order,
              active: s.active,
            },
          })
    ),
    // Borttagna pass inaktiveras, raderas aldrig: gamla samtal refererar dem.
    ...existing
      .filter((e) => !keep.has(e.id))
      .map((e) => db.callSlot.update({ where: { id: e.id }, data: { active: false } })),
  ];

  await db.$transaction(ops);
  revalidatePath("/admin/dialer");
  return { ok: true };
}

/**
 * Hur många dagars ringande som finns kvar i databasen.
 *
 * Den viktigaste siffran på hela sidan, och den som specen saknade: med ett
 * lågt tak tar leadsen slut långt innan uppföljningslogiken hinner spela roll.
 */
export async function getSupplyForecast() {
  await requireAdmin();

  const [config, total, retired, callable, recentAttempts] = await Promise.all([
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
    db.lead.count(),
    db.lead.count({ where: { retired: true } }),
    db.lead.count({
      where: {
        retired: false,
        hasActiveDeal: false,
        OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }],
      },
    }),
    // Faktisk samtalstakt de senaste sju dagarna.
    db.callAttempt.count({
      where: { startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  const maxAttempts = config?.maxAttempts ?? 8;
  const attemptsUsed = await db.lead.aggregate({ _sum: { attemptCount: true } });
  const used = attemptsUsed._sum.attemptCount ?? 0;

  const capacity = Math.max(0, (total - retired) * maxAttempts - used);
  const perDay = recentAttempts > 0 ? recentAttempts / 7 : 0;

  return {
    totalLeads: total,
    retiredLeads: retired,
    callableNow: callable,
    remainingAttempts: capacity,
    callsPerDay: Math.round(perDay),
    daysOfSupply: perDay > 0 ? Math.round(capacity / perDay) : null,
    maxAttempts,
  };
}
