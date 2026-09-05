import type { CallbackRow } from "@/app/actions/callbacks";

/**
 * Klockornas hämtning, från klienten.
 *
 * Finns för att båda klockorna ska sluta anropa `listCallbacks` som server
 * action. Server actions delar en enda seriell kö i App Routers klient, så en
 * pollning som fastnar mot en kall databas blockerar allt annat säljaren
 * trycker på. Se `/api/callbacks/route.ts`.
 *
 * `scheduledAt` måste väckas tillbaka till ett `Date`: JSON har inga datum, och
 * varje vy som räknar på raden (`bucketOf`, `formatWhen`, femminutersgränsen)
 * gör det på ett `Date`. Utan väckningen blir jämförelserna sanna mot en
 * sträng och klockan slutar larma — tyst, vilket är den värsta sorten här.
 */
export async function fetchCallbacks(
  scope: "mine" | "floor" = "mine"
): Promise<{ rows: CallbackRow[]; scope: "mine" | "floor"; isAdmin: boolean }> {
  const res = await fetch(`/api/callbacks?scope=${scope}`, {
    // Klockan ska aldrig visa ett cachat svar: en återkomst som just
    // dispositionerats måste vara borta vid nästa hämtning.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as {
    rows: Array<Omit<CallbackRow, "scheduledAt"> & { scheduledAt: string }>;
    scope: "mine" | "floor";
    isAdmin: boolean;
  };

  return {
    ...data,
    rows: data.rows.map((r) => ({ ...r, scheduledAt: new Date(r.scheduledAt) })),
  };
}
