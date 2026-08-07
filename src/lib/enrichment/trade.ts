/**
 * Yrkesterm och ort — de två delarna ett sökord består av.
 *
 * Rank mäts aldrig på bolagsnamnet. "Kulladals Snickeri AB" ligger etta på sitt
 * eget namn oavsett hur osynliga de är för en kund som söker hjälp, och den
 * siffran är värdelös. Rank mäts på TJÄNSTETERMEN — "snickare malmö" — och
 * hela svårigheten i rankspåret är att få fram den termen för varje bolag.
 *
 * Tre källor, i fallande ordning av auktoritet:
 *
 *   1. Googles egen kategori för bolaget, via /places. Auktoritativ — det är
 *      bolagets egen kategorisering. Kostar en kredit per bolag. Se serper.ts.
 *   2. Bolagsnamnet. Gratis, deterministiskt, ingen kvot. Svenska bolagsnamn
 *      är ovanligt informativa: "Fribo Bygg & Snickeriservice AB" säger vad de
 *      gör. Mätt mot beståndet avslöjar 47 % av namnen yrket.
 *   3. Sajtens titel, som nivå 0 redan hämtat gratis (`tech.title`).
 *
 * Den här filen är källa 2 och 3. Den gissar aldrig: matchar inget mönster
 * returneras null, och då hämtas ingen rank. Ett sökord byggt på en gissning
 * ger en rankuppgift som ser exakt lika trovärdig ut som en riktig, och det är
 * precis det som inte får hända.
 *
 * Termerna är valda som SÖKORD, inte som taxonomi. "snickare" och inte
 * "Bygg & anläggning" — det förra googlar folk, det senare gör ingen.
 */

/**
 * Mönster → sökbar yrkesterm. Ordningen är betydelsebärande: det som står
 * först vinner, så det specifika måste ligga före det generella. "takservice"
 * ska bli takläggare och inte fastna på "service".
 */
const TRADES: [RegExp, string][] = [
  // ── Bygg, i fallande specificitet ────────────────────────────────────────
  [/snickeri|snickar|trateknik|tratek|byggnadssnickeri/, "snickare"],
  [/takservice|takla(gg|gn)|taktjanst|tak & |tak och | tak\b|^tak/, "takläggare"],
  [/plattsattn|kakel|klinker/, "plattsättare"],
  [/golv(lagg|service|slip|ab|entrepr)?/, "golvläggare"],
  [/mal(eri|are|ar|erifirma|ningsfirma)/, "målare"],
  [/mureri|murare|puts(ning)?\b/, "murare"],
  [/glasmasteri|glasmastare|glasservice/, "glasmästare"],
  [/fonsterputs|fonsterrenover/, "fönsterputs"],
  [/riv(ning|nings)|sanering|asbest/, "rivningsfirma"],
  [/brandtatn|brandskydd|brandkonsult/, "brandskyddsföretag"],
  [/stallning|stallningsbygg/, "ställningsbyggare"],
  [/isolering|isoler/, "isoleringsfirma"],
  [/betong|betongborr/, "betongfirma"],
  [/bygg|byggnads|entreprenad|byggservice|byggfirma|husbygg/, "byggfirma"],

  // ── Installation ─────────────────────────────────────────────────────────
  [/vvs|rormokeri|rormokar|rorfirma|rorservice|ror & /, "rörmokare"],
  [/ventilation|klimatservice|kyl(a|service|teknik)|varmepump|varmecenter/, "ventilationsfirma"],
  [/elektriska|elinstallation|eltjanst|elservice|elfirma|elkraft|el-?teknik|elektriker/, "elektriker"],
  [/lars\b|las(smed|service)|lasteknik/, "låssmed"],
  [/larm|bevakning|sakerhetsteknik|sakerhetsservice/, "säkerhetsföretag"],
  [/smide|svets|metallteknik|plat(slageri|slagare)/, "smidesfirma"],
  [/borrning|brunnsborr|geoenergi/, "borrningsföretag"],

  // ── Mark och yttre ───────────────────────────────────────────────────────
  [/tradgard|tradfall|arborist|gronyte|parkskotsel/, "trädgårdsanläggning"],
  [/markarbete|markentrepr|schakt|grav(maskin|tjanst)/, "markentreprenör"],
  // Mönstren matchas mot fold()-utdata, där å/ä/ö redan är nedfällda. Ett ä
  // kvar i ett mönster matchar därför aldrig något.
  [/asfalt|belaggning/, "asfaltering"],

  // ── Service ──────────────────────────────────────────────────────────────
  [/stadfirma|stadservice|stadbolag|lokalvard|hemstad|flyttstad|stadning/, "städfirma"],
  [/flyttfirma|flyttservice|flytt & |bohagsflytt/, "flyttfirma"],
  [/akeri|budbil|transport|logistik|frakt|distribution|spedition/, "transportföretag"],
  [/bilverkstad|bilservice|motorservice|fordonsservice|dackservice|bilplat/, "bilverkstad"],
  [/bilhandel|bilforsalj|bilcenter/, "bilhandlare"],

  // ── Kontor och rådgivning ────────────────────────────────────────────────
  [/redovisning|bokforing|revision|revisor|ekonomibyra|ekonomikonsult/, "redovisningsbyrå"],
  [/advokat|juridik|jurist|juristbyra|affarsjuridik/, "advokatbyrå"],
  [/fastighetsbyra|maklare|maklarbyra/, "fastighetsmäklare"],
  [/forsakringsmaklare|forsakringsformedl|assurans/, "försäkringsmäklare"],
  [/bemanning|rekrytering|personaluthyrn/, "bemanningsföretag"],
  [/reklambyra|marknadsforing|kommunikationsbyra|mediabyra|designbyra/, "reklambyrå"],
  [/arkitekt|inredningsarkitekt|byggkonsult|konstruktionsbyra/, "arkitekt"],
  [/fastighetsforvaltn|fastighetsservice|fastighetsskotsel/, "fastighetsförvaltning"],
  [/it-?konsult|datakonsult|systemutveckl|webbyra|webbutveckl|mjukvaru/, "it-konsult"],

  // ── Hälsa och kropp ──────────────────────────────────────────────────────
  // Stam, inte hel form: "Tandläkarna i Lund" böjer ordet och "tandlakare"
  // är inte en delsträng av "tandlakarna". Samma fälla lurar på alla
  // yrkesbeteckningar som kan stå i bestämd form plural.
  [/tandlakar|tandvard|tandklinik|dentala?\b/, "tandläkare"],
  [/fotvard|fotterapi|fotklinik/, "fotvård"],
  [/naprapat|kiropraktor|osteopat/, "naprapat"],
  [/sjukgymnast|fysioterap/, "sjukgymnast"],
  [/massage|massor/, "massage"],
  [/psykolog|psykoterap|samtalsmottagn|terapi\b/, "psykolog"],
  [/veterinar|djurklinik|djursjukhus/, "veterinär"],
  [/frisor|harvard|barbershop|barberare|salong/, "frisör"],
  [/hudvard|skonhet|kosmetik|naglar|nagelsalong|skonhetssalong/, "skönhetssalong"],
  [/optiker|synundersokn/, "optiker"],
  [/halsa|vardcentral|mottagning|klinik/, "klinik"],

  // ── Mat och handel ───────────────────────────────────────────────────────
  [/restaurang|pizzeria|krog|bistro|matsal/, "restaurang"],
  [/cafe|konditori|bageri/, "café"],
  [/catering|festvaning/, "catering"],
  [/blomster|florist/, "blomsterhandel"],
  [/skraddare|skradderi|syatelje/, "skräddare"],

  // ── Övrigt ───────────────────────────────────────────────────────────────
  [/utbildning|kursgard|trafikskola|korskola/, "utbildningsföretag"],
  [/stadarbete|konsult(bolag|firma|byra)?\b|radgivning|advisory/, "konsult"],
];

/** Fäller ned svenska tecken så mönstren slipper dubbelstavas. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[éè]/g, "e")
    .replace(/[üû]/g, "u")
    .replace(/[^a-z0-9 &-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Härleder en sökbar yrkesterm ur fritext — ett bolagsnamn eller en sajttitel.
 *
 * Returnerar null när inget mönster träffar. Det är det vanliga utfallet för
 * intetsägande namn ("+Moveco AB", "AB Xforto") och ska förbli det: hellre
 * ingen rankuppgift än en mätt på fel sökord.
 */
export function tradeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const folded = fold(text);
  if (!folded) return null;
  for (const [pattern, trade] of TRADES) {
    if (pattern.test(folded)) return trade;
  }
  return null;
}

/**
 * Ort ur en adress.
 *
 * Svenska adresser i registerexporter har formen "Gata 1, 112 57 Stockholm".
 * Orten är allt efter postnumret. Utan den här kan 606 leads i beståndet inte
 * få något sökord alls, trots att orten står utskriven i adressfältet bredvid.
 *
 * Medvetet strikt: krävs ett femsiffrigt postnummer att räkna från. En adress
 * utan postnummer kan lika gärna sluta i ett kvartersnamn som i en ort, och en
 * felaktig ort ger ett sökord som mäter fel stad.
 */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  // "112 57 Stockholm" och "11257 Stockholm" — båda förekommer.
  const match = address.match(/\b\d{3}\s?\d{2}\s+([A-Za-zÅÄÖåäöÉéÜü][\wÅÄÖåäöÉéÜü'’\- ]{1,40})\s*$/);
  if (!match) return null;
  const city = match[1].trim().replace(/\s+/g, " ");
  // Enstaka bokstav eller siffervärde är inte en ort.
  if (city.length < 2 || /^\d+$/.test(city)) return null;
  return city;
}
