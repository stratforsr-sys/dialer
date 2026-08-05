/**
 * Ren claim-logik — inga DB-beroenden, så den kan användas både i
 * server actions och i klientkomponenter.
 */

/** Hur länge ett claim-lås håller innan leadet blir fritt igen. */
export const CLAIM_TTL_DAYS = 60;

const TTL_MS = CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Tidpunkten då ett lås måste ha satts för att fortfarande gälla. */
export function claimCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TTL_MS);
}

/** Är leadet ledigt just nu? */
export function isLeadFree(
  lead: { claimedAt: Date | string | null },
  now: Date = new Date()
): boolean {
  if (!lead.claimedAt) return true;
  return new Date(lead.claimedAt).getTime() < claimCutoff(now).getTime();
}

/** När löper ett lås ut? */
export function claimExpiry(claimedAt: Date | string): Date {
  return new Date(new Date(claimedAt).getTime() + TTL_MS);
}

export type ClaimState =
  | { state: "free" }
  | { state: "mine"; expiresAt: Date }
  | { state: "taken"; by: { id: string; name: string }; expiresAt: Date };

/** Claim-status ur en given användares perspektiv — driver UI:t. */
export function claimState(
  lead: {
    claimedAt: Date | string | null;
    ownerId: string;
    owner?: { id: string; name: string } | null;
  },
  viewerId: string,
  now: Date = new Date()
): ClaimState {
  if (isLeadFree(lead, now)) return { state: "free" };
  const expiresAt = claimExpiry(lead.claimedAt!);
  if (lead.ownerId === viewerId) return { state: "mine", expiresAt };
  return {
    state: "taken",
    by: lead.owner ?? { id: lead.ownerId, name: "Annan säljare" },
    expiresAt,
  };
}
