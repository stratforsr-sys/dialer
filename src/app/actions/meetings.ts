"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/lists";
import { ForbiddenError } from "@/lib/guard";
import {
  rotationResumeAt,
  toSchedulerConfig,
  noRestDays,
  alignToSlot,
  pickNextSlot,
  type Slot,
} from "@/lib/scheduler";
import {
  validateResolution,
  leadEffect,
  resolutionLabel,
  acceptableMeetingTime,
  clampDuration,
  cleanText,
  KIND_LABELS,
  type Resolution,
  type MeetingKindLike,
  type NoReasonLike,
} from "@/lib/moten";
import { SYSTEM_USER_EMAIL } from "@/lib/system-user";
import { formatWhen } from "@/lib/time";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Möten — allt EFTER bokningen.
 *
 * Bokningen sker inte här. Den sker i `recordAttempt`, i samma transaktion
 * som samtalet, av samma skäl som en återkomst: ett möte utan sitt samtal är
 * en rad som ljuger om varför den finns. Här ligger listan, ändringarna och
 * avgörandet.
 *
 * Reglerna för vad ett avgörande gör med bolaget står i `lib/moten.ts`
 * (`leadEffect`) och provas i `scripts/test-moten.ts`. Den här filen
 * översätter dem till skrivningar.
 */

const MAX_OPEN = 500;
const RECENT_DAYS = 30;
const MAX_RECENT = 300;

// ── Läsning ────────────────────────────────────────────────────────────────

const ROW_SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  kind: true,
  location: true,
  note: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  contactId: true,
  status: true,
  outcome: true,
  noReason: true,
  outcomeNote: true,
  rescheduleCount: true,
  dealId: true,
  createdAt: true,
  resolvedAt: true,
  leadId: true,
  lead: { select: { companyName: true, city: true, address: true } },
  bookedBy: { select: { id: true, name: true } },
  holder: { select: { id: true, name: true } },
} as const;

export type MeetingRow = Prisma.MeetingGetPayload<{ select: typeof ROW_SELECT }>;

/** Ett möte man inte bokat, inte håller och inte är admin för är inte ens. */
function mineWhere(userId: string): Prisma.MeetingWhereInput {
  return { OR: [{ holderId: userId }, { bookedById: userId }] };
}

/**
 * Listan på /meetings: alla öppna (utan tak bakåt eller framåt — samma princip
 * som `listCallbacks`, ett passerat möte utan utfall ska aldrig falla ur bild),
 * och de som avgjorts de senaste 30 dagarna.
 *
 * `scope: "floor"` kräver admin. En säljare som ber om golvet får sina egna.
 */
export async function listMeetings(scope: "mine" | "floor" = "mine") {
  const user = await requireAuth();
  const admin = isAdminUser(user);
  const effective: "mine" | "floor" = scope === "floor" && admin ? "floor" : "mine";
  const who = effective === "mine" ? mineWhere(user.id) : {};
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);

  const [open, recent] = await Promise.all([
    db.meeting.findMany({
      where: { AND: [who, { status: "BOOKED" }] },
      select: ROW_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: MAX_OPEN,
    }),
    db.meeting.findMany({
      where: { AND: [who, { status: { not: "BOOKED" } }, { resolvedAt: { gte: since } }] },
      select: ROW_SELECT,
      orderBy: { scheduledAt: "desc" },
      take: MAX_RECENT,
    }),
  ]);

  return { open, recent, scope: effective, isAdmin: admin, userId: user.id };
}

/**
 * Vem som kan hålla ett möte: alla riktiga konton. Gravstenskontot står i
 * användartabellen men är ingen person.
 */
export async function listMeetingHolders(): Promise<Array<{ id: string; name: string }>> {
  await requireAuth();
  return db.user.findMany({
    where: { email: { not: SYSTEM_USER_EMAIL } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Mötena per säljare under en period — bokningen krediteras den som bokade.
 * Säljare ser bara sin egen rad; admin ser alla.
 */
export async function getMeetingBoard(days = 30) {
  const user = await requireAuth();
  const admin = isAdminUser(user);
  const since = new Date(Date.now() - Math.max(1, Math.min(days, 365)) * 86_400_000);

  const rows = await db.meeting.findMany({
    where: { createdAt: { gte: since }, ...(admin ? {} : { bookedById: user.id }) },
    select: {
      scheduledAt: true,
      durationMin: true,
      status: true,
      outcome: true,
      bookedById: true,
      bookedBy: { select: { name: true } },
    },
  });

  // Samtalen räknas på samma säljare och samma period, så att "samtal per
  // möte" jämför samma sak — CallAttempt är statistikens nämnare.
  const calls = await db.callAttempt.groupBy({
    by: ["sellerId"],
    where: { startedAt: { gte: since }, ...(admin ? {} : { sellerId: user.id }) },
    _count: { _all: true },
  });
  const callsBy = new Map(calls.map((c) => [c.sellerId, c._count._all]));

  return { rows, callsBy: Object.fromEntries(callsBy), since, isAdmin: admin };
}

// ── Grind ──────────────────────────────────────────────────────────────────

/** Mötets hållare, den som bokade det, eller admin. */
async function requireMeetingAccess(id: string) {
  const user = await requireAuth();
  const m = await db.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      leadId: true,
      contactId: true,
      bookedById: true,
      holderId: true,
      scheduledAt: true,
      durationMin: true,
      kind: true,
      location: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      lead: { select: { companyName: true } },
    },
  });
  if (!m) throw new ForbiddenError(`meeting ${id}`);
  if (!isAdminUser(user) && m.holderId !== user.id && m.bookedById !== user.id) {
    throw new ForbiddenError(`meeting ${id}`);
  }
  return { user, m };
}

/** Ett riktigt konto, eller null. */
async function realUserId(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
  return u && u.email !== SYSTEM_USER_EMAIL ? u.id : null;
}

/** Prisma svarar P2025 när ett villkorat `update` inte träffar någon rad. */
function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2025";
}

const ALREADY_RESOLVED = "Mötet har redan fått ett utfall — ladda om sidan";

// ── Ändra ett bokat möte ───────────────────────────────────────────────────

export interface UpdateMeetingInput {
  /** ISO. Ny tid flyttar mötet och räknar upp `rescheduleCount`. */
  at?: string;
  durationMin?: number;
  kind?: MeetingKindLike;
  location?: string | null;
  note?: string | null;
  holderId?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

/**
 * Flytta eller ändra ett öppet möte. Raden behålls — mötet är samma möte —
 * men en flytt räknas och loggas, så att ett möte som flyttats fyra gånger
 * går att se.
 */
export async function updateMeeting(id: string, patch: UpdateMeetingInput) {
  const { user, m } = await requireMeetingAccess(id);
  if (m.status !== "BOOKED") throw new Error(ALREADY_RESOLVED);

  // Unchecked-formen med skalärer, med flit: ett nästlat `holder: { connect }`
  // får Prisma att läsa raden FÖRE uppdateringen, och då kastas inget P2025 om
  // någon hann avgöra mötet emellan — transaktionen gick vidare, skrev över
  // leadets vila och loggade en ändring som aldrig gjordes. Med bara skalärer
  // är satsen ett enda villkorat UPDATE.
  const data: Prisma.MeetingUncheckedUpdateInput = {};
  const changes: string[] = [];
  const now = new Date();

  let newAt: Date | null = null;
  if (patch.at !== undefined) {
    const at = new Date(patch.at);
    if (!acceptableMeetingTime(at, now) || at.getTime() <= now.getTime()) {
      throw new Error("Välj en tid framåt");
    }
    if (at.getTime() !== m.scheduledAt.getTime()) {
      newAt = at;
      data.scheduledAt = at;
      data.rescheduleCount = { increment: 1 };
      changes.push(`flyttat från ${formatWhen(m.scheduledAt, now)} till ${formatWhen(at, now)}`);
    }
  }
  if (patch.durationMin !== undefined) {
    const d = clampDuration(patch.durationMin);
    if (d !== m.durationMin) {
      data.durationMin = d;
      changes.push(`${d} min`);
    }
  }
  if (patch.kind !== undefined && Object.hasOwn(KIND_LABELS, patch.kind) && patch.kind !== m.kind) {
    data.kind = patch.kind;
    changes.push(KIND_LABELS[patch.kind]);
  }
  if (patch.location !== undefined) data.location = cleanText(patch.location);
  if (patch.note !== undefined) data.note = cleanText(patch.note, 2000);
  if (patch.contactName !== undefined) data.contactName = cleanText(patch.contactName, 200);
  if (patch.contactEmail !== undefined) data.contactEmail = cleanText(patch.contactEmail, 200);
  if (patch.contactPhone !== undefined) data.contactPhone = cleanText(patch.contactPhone, 50);
  if (patch.holderId !== undefined && patch.holderId !== m.holderId) {
    const h = await realUserId(patch.holderId);
    if (!h) throw new Error("Den personen finns inte längre");
    const name = await db.user.findUnique({ where: { id: h }, select: { name: true } });
    data.holderId = h;
    changes.push(`${name?.name ?? "en kollega"} håller mötet`);
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [
    // Villkorat på BOOKED: ett möte som någon hann avgöra mellan läsningen
    // ovan och skrivningen här ska inte få en ny tid i efterhand.
    db.meeting.update({ where: { id, status: "BOOKED" }, data }),
  ];
  if (newAt) {
    // Skyddsnätet på leadet följer mötet (se `computeNext` steg 2b). Bara när
    // ingen återkomst äger tiden — då är det dess eko som gäller.
    writes.push(
      db.lead.updateMany({
        where: { id: m.leadId, retired: false, callbackAt: null },
        data: { nextActionAt: newAt },
      })
    );
  }
  if (changes.length > 0) {
    writes.push(
      db.activity.create({
        data: {
          type: "STATUS_CHANGE",
          leadId: m.leadId,
          actorId: user.id,
          metadata: JSON.stringify({ status: `Möte ändrat: ${changes.join(", ")}`, notes: null, meetingId: id }),
        },
      })
    );
  }

  try {
    await db.$transaction(writes);
  } catch (err) {
    if (isNotFound(err)) throw new Error(ALREADY_RESOLVED);
    throw err;
  }

  revalidatePath("/meetings");
  return { ok: true as const };
}

// ── Avgörandet ─────────────────────────────────────────────────────────────

export interface ResolveMeetingInput {
  meetingId: string;
  status: "HELD" | "NO_SHOW" | "CANCELLED";
  outcome?: "SALD" | "NEJ" | "UPPFOLJNING" | null;
  noReason?: NoReasonLike | null;
  note?: string | null;
  /** Affären, när utfallet är SALD. Skapas i samma transaktion som avgörandet. */
  deal?: {
    contactName: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    valueType: "ONE_TIME" | "MONTHLY";
    value: number;
    notes?: string | null;
  } | null;
  followUp?:
    | {
        type: "meeting";
        at: string;
        durationMin: number;
        kind?: MeetingKindLike;
        location?: string | null;
        note?: string | null;
        holderId?: string | null;
      }
    | { type: "callback"; at: string; note?: string | null; emailReminder?: boolean }
    | { type: "release" }
    | null;
}

/**
 * Hur gick mötet? Skriver avgörandet, bolagets nya tillstånd, nästa steg och
 * raden i aktivitetsloggen — allt eller ingenting.
 *
 * ## Varför en transaktion i array-form och inte ett villkor före
 *
 * Två personer kan avgöra samma möte samtidigt: hållaren efter mötet och
 * bokaren som ser "utfall saknas" och vill hjälpa till. Första satsen i
 * transaktionen är ett `update` villkorat på `status = BOOKED`. Den som
 * kommer sist får P2025 när Postgres prövar villkoret om efter radlåset, och
 * HELA transaktionen rullas tillbaka — inget dubbelt nytt möte, ingen dubbel
 * affär, ingen andra loggrad. Samma batchade form som `recordAttempt`, som
 * redan går mot Neon varje dag; ingen interaktiv transaktion som håller
 * anslutningen öppen över nätet.
 */
export async function resolveMeeting(input: ResolveMeetingInput) {
  const { user, m } = await requireMeetingAccess(input.meetingId);
  if (m.status !== "BOOKED") throw new Error(ALREADY_RESOLVED);

  const now = new Date();
  const note = cleanText(input.note, 2000);
  const dealId = input.status === "HELD" && input.outcome === "SALD" ? randomUUID() : null;

  // ── Översätt till den rena formen och validera där ────────────────────
  let res: Resolution;
  const f = input.followUp;
  const followUp =
    f?.type === "meeting"
      ? { type: "meeting" as const, at: new Date(f.at), durationMin: clampDuration(f.durationMin) }
      : f?.type === "callback"
        ? { type: "callback" as const, at: new Date(f.at) }
        : f?.type === "release"
          ? { type: "release" as const }
          : (undefined as never);
  if (input.status === "HELD" && input.outcome === "SALD") {
    if (!input.deal) throw new Error("Affären måste registreras först");
    res = { status: "HELD", outcome: "SALD", dealId: dealId! };
  } else if (input.status === "HELD" && input.outcome === "NEJ") {
    res = { status: "HELD", outcome: "NEJ", noReason: input.noReason as NoReasonLike };
  } else if (input.status === "HELD" && input.outcome === "UPPFOLJNING") {
    res = { status: "HELD", outcome: "UPPFOLJNING", followUp };
  } else if (input.status === "NO_SHOW" || input.status === "CANCELLED") {
    res = { status: input.status, followUp };
  } else {
    throw new Error("Välj hur mötet gick");
  }
  const invalid = validateResolution(res, now);
  if (invalid) throw new Error(invalid);

  if (res.status === "HELD" && res.outcome === "SALD") {
    const d = input.deal!;
    if (!d.contactName?.trim()) throw new Error("Vem sa ja?");
    if (!Number.isFinite(d.value) || d.value <= 0) throw new Error("Ange ett belopp");
  }

  const effect = leadEffect(res, m);

  // Nästa stegs ägare måste vara ett riktigt konto. Har den som bokade slutat
  // (gravstenskontot) tar den som avgör över — annars hamnar återkomsten hos
  // någon som aldrig ser den.
  const ownerFor = async (id: string) => (await realUserId(id)) ?? user.id;

  // ── Läsningar som bolagets nya tillstånd beror på ─────────────────────
  const [lead, cfg, slots, otherCallbacks, otherMeetings] = await Promise.all([
    db.lead.findUnique({
      where: { id: m.leadId },
      select: { lastAttemptAt: true, lastResult: true, lastOutcome: true, lastNoReason: true, noAnswerStreak: true },
    }),
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
    db.callSlot.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    db.callback.findMany({
      where: { leadId: m.leadId, status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, sellerId: true },
    }),
    db.meeting.count({ where: { leadId: m.leadId, status: "BOOKED", id: { not: m.id } } }),
  ]);
  if (!lead) throw new Error("Bolaget finns inte längre");

  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.meeting.update({
      where: { id: m.id, status: "BOOKED" },
      data: {
        status: res.status,
        outcome: res.status === "HELD" ? res.outcome : null,
        noReason: res.status === "HELD" && res.outcome === "NEJ" ? res.noReason : null,
        outcomeNote: note,
        resolvedAt: now,
        resolvedById: user.id,
      },
    }),
  ];

  // ── Bolaget ───────────────────────────────────────────────────────────
  // Unchecked: `ownerId` som skalär. Ett nästlat `owner: { connect }` mot en
  // användare som raderats under tiden hade gett P2025 — och det läses här som
  // "mötet har redan fått ett utfall", vilket hade varit ett falskt besked.
  let leadData: Prisma.LeadUncheckedUpdateInput | null = null;
  let followUpText = "";

  if (effect.kind === "sold") {
    const d = input.deal!;
    // Affären krediteras den som höll mötet — det var hen som stängde den.
    // `createdById` är vad provisionen räknas på (se CLAUDE.md, Affärer).
    const sellerId = await ownerFor(m.holderId);
    writes.push(
      db.deal.create({
        data: {
          id: dealId!,
          title: m.lead.companyName,
          contactName: d.contactName.trim(),
          contactEmail: cleanText(d.contactEmail, 200),
          contactPhone: cleanText(d.contactPhone, 50),
          valueType: d.valueType === "MONTHLY" ? "MONTHLY" : "ONE_TIME",
          value: d.value,
          notes: cleanText(d.notes, 2000),
          status: "WON",
          leadId: m.leadId,
          createdById: sellerId,
        },
      }),
      // Kopplingen skrivs efter att affären finns — samma transaktion.
      db.meeting.update({ where: { id: m.id }, data: { dealId: dealId! } }),
      db.activity.create({
        data: {
          type: "DEAL_WON",
          actorId: user.id,
          leadId: m.leadId,
          metadata: JSON.stringify({ dealId, title: m.lead.companyName, value: d.value, valueType: d.valueType, meetingId: m.id }),
        },
      }),
      // Terminalt, som SOLD i dispositionen: allas löften på bolaget stängs —
      // det finns inget kvar att ringa om — och andra öppna möten avbokas.
      db.callback.updateMany({
        where: { leadId: m.leadId, status: "PENDING" },
        data: { status: "COMPLETED", completedAt: now },
      }),
      db.meeting.updateMany({
        where: { leadId: m.leadId, status: "BOOKED", id: { not: m.id } },
        data: { status: "CANCELLED", resolvedAt: now, resolvedById: user.id, outcomeNote: "Avbokat — bolaget blev kund" },
      })
    );
    leadData = {
      retired: true,
      retiredReason: "sald",
      hasActiveDeal: true,
      callbackAt: null,
      nextActionAt: null,
      claimedAt: now,
      ownerId: sellerId,
      lastOutcome: "SOLD",
    };
  } else if (effect.kind === "said_no") {
    // Som `cancelCallback` med SA_NEJ: vilan räknas från NU, och ett annat
    // löfte på bolaget vinner över vilan.
    if (otherCallbacks.length > 0) {
      // Ett annat löfte står kvar — en kollegas, eller bokarens eget. Då är
      // bolaget det löftets: ekot, låset och ägaren följer den tidigaste
      // öppna raden, samma regel som `recordAttempt` (`remaining`).
      const first = otherCallbacks[0];
      leadData = {
        lastOutcome: "DM_NO",
        lastNoReason: effect.noReason,
        callbackAt: first.scheduledAt,
        nextActionAt: first.scheduledAt,
        claimedAt: now,
        ownerId: first.sellerId,
      };
    } else {
      const config = cfg ? toSchedulerConfig(cfg) : null;
      let nextActionAt: Date | null = null;
      if (config) {
        const rest = new Date(now);
        rest.setDate(rest.getDate() + noRestDays(effect.noReason, config));
        nextActionAt = alignToSlot(rest, pickNextSlot(slots as Slot[], [], rest), config.blockedDates);
      }
      leadData = {
        // Saknas konfigurationen: hellre den vila bolaget redan har än NULL,
        // som däcket sorterar FÖRST (`ASC NULLS FIRST`).
        ...(nextActionAt ? { nextActionAt } : {}),
        callbackAt: null,
        claimedAt: null,
        lastOutcome: "DM_NO",
        lastNoReason: effect.noReason,
      };
    }
  } else if (effect.kind === "new_meeting") {
    const fm = input.followUp as Extract<NonNullable<ResolveMeetingInput["followUp"]>, { type: "meeting" }>;
    const holderId = (await realUserId(fm.holderId)) ?? (await ownerFor(effect.ownerId));
    writes.push(
      db.meeting.create({
        data: {
          leadId: m.leadId,
          contactId: m.contactId,
          // Bokningen krediteras den som bokade om — det är ett nytt ja.
          bookedById: user.id,
          holderId,
          scheduledAt: effect.at,
          durationMin: clampDuration(fm.durationMin),
          kind: fm.kind && Object.hasOwn(KIND_LABELS, fm.kind) ? fm.kind : m.kind,
          location: fm.location !== undefined ? cleanText(fm.location) : m.location,
          note: cleanText(fm.note, 2000),
          contactName: m.contactName,
          contactEmail: m.contactEmail,
          contactPhone: m.contactPhone,
        },
      })
    );
    leadData = {
      nextActionAt: effect.at,
      claimedAt: now,
      ownerId: holderId,
    };
    followUpText = ` Nytt möte ${formatWhen(effect.at, now)}.`;
  } else if (effect.kind === "callback") {
    const ownerId = await ownerFor(effect.ownerId);
    const cbNote =
      input.followUp?.type === "callback" ? cleanText(input.followUp.note, 300) : null;
    writes.push(
      db.callback.create({
        data: {
          leadId: m.leadId,
          contactId: m.contactId,
          sellerId: ownerId,
          scheduledAt: effect.at,
          emailReminder: input.followUp?.type === "callback" && input.followUp.emailReminder === true,
          note:
            cbNote ??
            (res.status === "NO_SHOW"
              ? "Kom inte till mötet — boka om"
              : res.status === "CANCELLED"
                ? "Mötet avbokades — boka om"
                : "Uppföljning efter mötet"),
        },
      })
    );
    // Ekot av den tidigaste öppna återkomsten — den nya, eller en äldre som
    // redan står på bolaget. Ägaren och låset följer SAMMA rad: ett öppet
    // löfte är alltid låst till den som gav det (`recordAttempt`, `remaining`).
    const earliest = [{ scheduledAt: effect.at, sellerId: ownerId }, ...otherCallbacks].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    )[0];
    leadData = {
      callbackAt: earliest.scheduledAt,
      nextActionAt: earliest.scheduledAt,
      claimedAt: now,
      ownerId: earliest.sellerId,
    };
    followUpText = ` Återkomst ${formatWhen(effect.at, now)}.`;
  } else {
    // Släpp. Står ett annat möte kvar ligger bolaget utanför däcket ändå, och
    // då rörs det inte. Står ett löfte kvar vinner det. Annars tillbaka i
    // rotationen på den vila bolaget redan tjänat ihop — aldrig NULL, som
    // däcket sorterar först (se `syncLeadFromCallbacks`).
    if (otherMeetings > 0) {
      leadData = null;
    } else if (otherCallbacks.length > 0) {
      const first = otherCallbacks[0];
      leadData = {
        callbackAt: first.scheduledAt,
        nextActionAt: first.scheduledAt,
        claimedAt: now,
        ownerId: first.sellerId,
      };
    } else {
      const resumeAt = cfg
        ? rotationResumeAt({
            lastAttemptAt: lead.lastAttemptAt,
            lastResult: lead.lastResult,
            lastOutcome: lead.lastOutcome,
            lastNoReason: lead.lastNoReason,
            noAnswerStreak: lead.noAnswerStreak,
            slots: slots as Slot[],
            config: toSchedulerConfig(cfg),
          })
        : null;
      leadData = {
        ...(resumeAt ? { nextActionAt: resumeAt } : {}),
        callbackAt: null,
        claimedAt: null,
      };
    }
  }

  if (leadData) writes.push(db.lead.update({ where: { id: m.leadId }, data: leadData }));

  writes.push(
    db.activity.create({
      data: {
        type: "STATUS_CHANGE",
        leadId: m.leadId,
        actorId: user.id,
        // Samma form som CALL-raderna — { status, notes } — så att lead-sidan
        // och historiken renderar den utan att veta att den finns.
        metadata: JSON.stringify({
          status: resolutionLabel(res),
          notes: [note, followUpText.trim()].filter(Boolean).join(" ") || null,
          meetingId: m.id,
        }),
      },
    })
  );

  try {
    await db.$transaction(writes);
  } catch (err) {
    if (isNotFound(err)) throw new Error(ALREADY_RESOLVED);
    throw err;
  }

  revalidatePath("/meetings");
  revalidatePath(`/leads/${m.leadId}`);
  if (dealId) revalidatePath("/deals");
  return { ok: true as const, dealId };
}
