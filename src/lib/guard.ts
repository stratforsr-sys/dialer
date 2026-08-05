/**
 * Behörighetsgrindar för server actions.
 *
 * Regeln: ingen exporterad action tar emot ett id utan att först gå genom
 * en grind härifrån. `requireAuth()` svarar bara på frågan "är du inloggad" —
 * aldrig på frågan "får du röra just det här objektet". Att blanda ihop de
 * två är hur leads.ts:189 och sessions.ts:21 kunde bli publika.
 */

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { visibleLeadWhere, isAdminUser } from "@/lib/lists";

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/** Kastas när användaren är inloggad men saknar rätt till objektet. */
export class ForbiddenError extends Error {
  constructor(what: string) {
    super(`Forbidden: ${what}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Leadet måste vara synligt för användaren — eget, eller i en mapp hen har
 * tillgång till. Admin passerar alltid. Använd för LÄSNING och för skrivningar
 * som hör till det normala säljarbetet (samtal, anteckningar, dispositioner).
 */
export async function requireLeadAccess(leadId: string): Promise<AuthedUser> {
  const user = await requireAuth();
  if (isAdminUser(user)) return user;

  const lead = await db.lead.findFirst({
    where: { AND: [{ id: leadId }, visibleLeadWhere(user)] },
    select: { id: true },
  });
  if (!lead) throw new ForbiddenError(`lead ${leadId}`);
  return user;
}

/**
 * Strängare: användaren måste ÄGA leadet (eller vara admin). Använd för
 * skrivningar som påverkar vem leadet tillhör eller om det finns kvar.
 */
export async function requireLeadOwner(leadId: string): Promise<AuthedUser> {
  const user = await requireAuth();
  if (isAdminUser(user)) return user;

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: user.id },
    select: { id: true },
  });
  if (!lead) throw new ForbiddenError(`lead ${leadId} (kräver ägarskap)`);
  return user;
}

/**
 * Kontakten ärver behörighet från sitt lead — en kontakt är aldrig åtkomlig
 * på egen hand. Returnerar även leadId, som anroparen nästan alltid behöver.
 */
export async function requireContactAccess(
  contactId: string
): Promise<{ user: AuthedUser; leadId: string }> {
  const user = await requireAuth();

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, leadId: true },
  });
  if (!contact) throw new ForbiddenError(`contact ${contactId}`);

  if (!isAdminUser(user)) {
    const lead = await db.lead.findFirst({
      where: { AND: [{ id: contact.leadId }, visibleLeadWhere(user)] },
      select: { id: true },
    });
    if (!lead) throw new ForbiddenError(`contact ${contactId}`);
  }
  return { user, leadId: contact.leadId };
}

/**
 * Affären ärver behörighet från sitt lead. Returnerar leadId eftersom varje
 * skrivning på en affär också loggar en aktivitet på leadet.
 */
export async function requireDealAccess(
  dealId: string
): Promise<{ user: AuthedUser; leadId: string }> {
  const user = await requireAuth();

  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: { id: true, leadId: true },
  });
  if (!deal) throw new ForbiddenError(`deal ${dealId}`);

  if (!isAdminUser(user)) {
    const lead = await db.lead.findFirst({
      where: { AND: [{ id: deal.leadId }, visibleLeadWhere(user)] },
      select: { id: true },
    });
    if (!lead) throw new ForbiddenError(`deal ${dealId}`);
  }
  return { user, leadId: deal.leadId };
}

/**
 * Samtalssessioner tillhör alltid en säljare. Ingen får skriva i någon annans
 * session — statistiken i chefsvyn bygger på att de siffrorna inte går att
 * peta i utifrån.
 */
export async function requireSessionOwner(
  sessionId: string
): Promise<AuthedUser> {
  const user = await requireAuth();

  const session = await db.callSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true },
  });
  if (!session) throw new ForbiddenError(`session ${sessionId}`);
  return user;
}
