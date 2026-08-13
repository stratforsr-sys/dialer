import { redirect } from "next/navigation";

/**
 * Pipelinen är avvecklad.
 *
 * Kanbanbrädet beskrev en säljprocess som inte finns: leadet skulle vandra
 * från "Möte bokat" via "Demo" och "Offert" till "Stängd vunnen". Verksamheten
 * är one call close — möten togs bort redan i migration 007 — så varje affär
 * skapades direkt i det sista steget och brädet hade en kolumn med innehåll
 * och fyra tomma.
 *
 * `/deals` är det som ersätter den: alla affärer, senaste avslut först.
 *
 * Redirect och inte 404, av samma skäl som `/leads`: adressen ligger i
 * bokmärken och i länkar som skickats mellan säljare. En 404 hade sett ut som
 * ett fel i systemet.
 */
export default function PipelinePage() {
  redirect("/deals");
}
