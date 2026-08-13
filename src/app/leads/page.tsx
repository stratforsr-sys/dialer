import { redirect } from "next/navigation";

/**
 * Lead-listan är avvecklad.
 *
 * Den var en andra ingång till samma bolag som redan ligger i en ringlista, och
 * den enda som faktiskt behövde den var den som letade efter ETT lead. Den
 * uppgiften ligger nu i sökfältet på Ringlistor, som söker på bolagsnamn,
 * kontaktperson, ort, org.nr och telefonnummer över allt användaren har
 * tillgång till.
 *
 * Sidan är en redirect och inte en radering: `/leads` ligger i bokmärken, i
 * `revalidatePath`-anrop och i länkar som skickats mellan säljare. En 404 hade
 * sett ut som ett fel i systemet.
 *
 * **`/leads/[id]` lever vidare** och är oförändrad — det är dit notisklockan,
 * sökträffarna, affärerna och research länkar.
 */
export default function LeadsPage() {
  redirect("/lists");
}
