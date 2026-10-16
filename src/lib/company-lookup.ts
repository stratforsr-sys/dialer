/**
 * Länkarna till Merinfo och Google för ett bolag, på ett ställe.
 *
 * De används både i `AddNumberCard` (bolaget saknar nummer) och i cockpitens
 * bolagsrubrik (alltid, även när numret finns — där för att se vem som äger
 * bolaget, bolagsrutan och omdömen innan samtalet). Samma länk på båda ställena,
 * så att en säljare aldrig får två olika träffar för samma knapp.
 */

/**
 * Merinfo slås upp på org-numret utan bindestreck när det finns: då blir det en
 * träff i stället för en lista. Saknas det faller sökningen tillbaka på namn +
 * ort — sämre, men aldrig en död länk.
 */
export function merinfoHref(
  companyName: string,
  orgNumber?: string | null,
  city?: string | null,
): string {
  const digits = orgNumber?.replace(/\D/g, "") || null;
  const who = digits ?? [companyName, city].filter(Boolean).join(" ");
  return `https://www.merinfo.se/search?who=${encodeURIComponent(who)}`;
}

/**
 * Bara bolagsnamnet, utan ort och utan ordet "telefon". Numret ligger ofta i
 * Googles egen bolagsruta eller i en katalogträff, och varje extra ord i frågan
 * är ett ord som kan sålla bort just den träffen.
 */
export function googleHref(companyName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(companyName)}`;
}
