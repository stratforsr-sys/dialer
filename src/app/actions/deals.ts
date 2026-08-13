"use server";

/**
 * Affärer.
 *
 * En affär skapas bara när något faktiskt sålts — det finns ingen väg in hit
 * som går via ett bokat möte. Därför finns ingen `moveDealToStage` och ingen
 * `closeDeal`: raden föds stängd. Det enda som kan hända efteråt är att
 * uppgifterna rättas eller att affären ångras.
 */

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { requireLeadAccess, requireDealAccess } from "@/lib/guard";
import { visibleLeadWhere } from "@/lib/lists";
import { revalidatePath } from "next/cache";

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Alla affärer användaren har rätt att se, senaste avslut först.
 *
 * Ångrade (LOST) tas med. En säljare som letar efter "den där kunden som
 * hoppade av" ska hitta den — att dölja dem gör bara att någon ringer bolaget
 * igen utan att veta vad som hänt.
 */
export async function getDeals() {
  const user = await requireAuth();

  const deals = await db.deal.findMany({
    where: { lead: visibleLeadWhere(user) },
    orderBy: { closedAt: "desc" },
    select: {
      id: true,
      title: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      valueType: true,
      value: true,
      status: true,
      closedAt: true,
      notes: true,
      lead: {
        select: { id: true, companyName: true, city: true, industry: true, orgNumber: true },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return deals;
}

export type DealRow = Awaited<ReturnType<typeof getDeals>>[number];

/**
 * En affär med kundens hela förhistoria.
 *
 * Samtalen och anteckningarna ligger kvar på leadet — affären äger dem inte.
 * De hämtas hit ändå: frågan "vad sa vi till den här kunden?" ställs efter
 * avslutet minst lika ofta som före, och svaret ska inte kräva att man vet
 * att det finns en separat lead-sida bakom.
 */
export async function getDeal(dealId: string) {
  const { leadId } = await requireDealAccess(dealId);

  const [deal, lead] = await Promise.all([
    db.deal.findUnique({
      where: { id: dealId },
      include: {
        createdBy: { select: { id: true, name: true } },
        products: { select: { id: true, name: true, price: true, quantity: true, isRecurring: true, unit: true } },
      },
    }),
    db.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        companyName: true,
        orgNumber: true,
        website: true,
        address: true,
        city: true,
        industry: true,
        employees: true,
        revenue: true,
        // Leadets kontaktlista hämtas inte. Affären bär sin egen kopia av vem
        // som skrev på, och den ska stå kvar även om kontakten byts ut på
        // leadet efteråt — två listor med personer på samma sida hade bara
        // gjort det oklart vilken som gäller.
        callAttempts: {
          orderBy: { startedAt: "desc" },
          take: 20,
          select: {
            id: true, startedAt: true, result: true, outcome: true,
            noReason: true, note: true, sessionId: true,
            seller: { select: { name: true } },
          },
        },
        // Bara NOTE. `recordAttempt` skriver även en CALL-aktivitet när ett
        // samtal bär anteckning, och utan filtret hade samma text renderats
        // två gånger — en gång under sitt utfall och en gång som lös rad.
        activities: {
          where: { type: "NOTE" },
          orderBy: { timestamp: "desc" },
          take: 20,
          select: {
            id: true, timestamp: true, metadata: true,
            actor: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  if (!deal || !lead) return null;
  return { deal, lead };
}

export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDeal>>>;

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createDeal(data: {
  leadId: string;
  title: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  valueType: "ONE_TIME" | "MONTHLY";
  value?: number | null;
  notes?: string | null;
}) {
  const user = await requireLeadAccess(data.leadId);

  const deal = await db.deal.create({
    data: {
      title: data.title,
      contactName: data.contactName?.trim() || null,
      contactEmail: data.contactEmail?.trim() || null,
      contactPhone: data.contactPhone?.trim() || null,
      valueType: data.valueType,
      value: data.value ?? null,
      notes: data.notes?.trim() || null,
      status: "WON",
      leadId: data.leadId,
      createdById: user.id,
    },
  });

  // Bolaget är kund nu och ska inte ringas igen. `hasActiveDeal` är villkoret
  // som håller det utanför lease-frågan i dialer.ts.
  await db.lead.update({
    where: { id: data.leadId },
    data: { hasActiveDeal: true },
  });

  // DEAL_CREATED och DEAL_WON är samma händelse här — affären föds vunnen.
  // En rad, inte två: loggen ska gå att läsa.
  await db.activity.create({
    data: {
      type: "DEAL_WON",
      actorId: user.id,
      leadId: data.leadId,
      metadata: JSON.stringify({ dealId: deal.id, title: deal.title, value: deal.value, valueType: deal.valueType }),
    },
  });

  revalidatePath("/deals");
  revalidatePath(`/leads/${data.leadId}`);
  return deal;
}

export async function updateDeal(
  dealId: string,
  data: {
    title?: string;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    valueType?: "ONE_TIME" | "MONTHLY";
    value?: number | null;
    notes?: string | null;
    closedAt?: Date;
  }
) {
  await requireDealAccess(dealId);
  const deal = await db.deal.update({ where: { id: dealId }, data });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/leads/${deal.leadId}`);
  return deal;
}

/**
 * Affären ångras — kunden hoppade av innan den blev en kund.
 *
 * Raden raderas inte. Ett avslut som gick tillbaka är information, både för
 * den som ska ringa bolaget igen och för den som räknar stängningsgrad på
 * riktigt. Leadet släpps tillbaka i rotationen om ingen annan affär håller
 * det kvar.
 */
export async function cancelDeal(dealId: string, reason?: string) {
  const { user } = await requireDealAccess(dealId);

  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Affären finns inte");

  await db.deal.update({
    where: { id: dealId },
    data: {
      status: "LOST",
      notes: reason?.trim() ? [deal.notes, `Ångrad: ${reason.trim()}`].filter(Boolean).join("\n\n") : deal.notes,
    },
  });

  const stillWon = await db.deal.count({
    where: { leadId: deal.leadId, status: "WON", id: { not: dealId } },
  });
  if (stillWon === 0) {
    await db.lead.update({ where: { id: deal.leadId }, data: { hasActiveDeal: false } });
  }

  await db.activity.create({
    data: {
      type: "DEAL_LOST",
      actorId: user.id,
      leadId: deal.leadId,
      metadata: JSON.stringify({ dealId, title: deal.title, note: reason?.trim() || null }),
    },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/leads/${deal.leadId}`);
}
