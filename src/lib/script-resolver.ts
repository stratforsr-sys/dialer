/**
 * Manusmotorn — väljer variant och fyller i platshållare.
 *
 * Chefen skriver manuset själv. Ingen modell genererar text: varje lead skulle
 * då få en unik formulering, och då går det aldrig att veta VAD som fungerade.
 * Med ett skrivet manus testas hans formulering mot hans formulering, med
 * datan som enda variabel — ett kontrollerat experiment i stället för brus.
 *
 * Den enda verkliga komplikationen är saknad data. Alla leads har inte
 * rankposition, alla har inte en Google-profil, vissa har ingen sajt alls.
 * En platshållare som renderas tom är värre än ingen mening: säljaren läser
 * "ni ligger på plats när folk googlar" och tappar samtalet. Därför skrivs
 * flera varianter per steg, i prioritetsordning, och den första vars datakrav
 * är uppfyllda vinner. Sista varianten ska alltid sakna krav.
 */

export interface ResolverClaim {
  key: string;
  valueNum: number | null;
  valueStr: string | null;
  valueBool: boolean | null;
  unit: string | null;
  confidence: number;
}

export interface ResolverVariant {
  id: string;
  label: string;
  priority: number;
  body: string;
  requiredKeysJson: string;
  minConfidence: number;
}

export interface ResolvedScript {
  variantId: string | null;
  label: string | null;
  text: string;
  /** Nycklar som varianten använde — visas i förhandsgranskningen. */
  usedKeys: string[];
  /** True när ingen variant matchade och inget kunde renderas. */
  empty: boolean;
}

/** Platshållare: {seo.rank}, {gmb.reviewCount}, {företag} … */
const PLACEHOLDER = /\{([a-zA-Z0-9_.åäöÅÄÖ]+)\}/g;

export function parseRequiredKeys(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

/** Alla platshållare som förekommer i texten — driver kravförslagen i admin. */
export function placeholdersIn(body: string): string[] {
  const out = new Set<string>();
  for (const m of Array.from(body.matchAll(PLACEHOLDER))) out.add(m[1]);
  return Array.from(out);
}

function claimValue(c: ResolverClaim): string {
  if (c.valueStr !== null) return c.valueStr;
  if (c.valueNum !== null) {
    // Millisekunder läses inte högt som "6200" i ett samtal.
    if (c.unit === "ms") return (c.valueNum / 1000).toFixed(1).replace(".", ",");
    return Number.isInteger(c.valueNum) ? String(c.valueNum) : c.valueNum.toFixed(1).replace(".", ",");
  }
  if (c.valueBool !== null) return c.valueBool ? "ja" : "nej";
  return "";
}

/**
 * Väljer variant och renderar.
 *
 * `context` är värden som alltid finns (bolagsnamn, kontaktnamn, ort) och som
 * därför aldrig behöver stå med i kraven.
 */
export function resolveScript(
  variants: ResolverVariant[],
  claims: ResolverClaim[],
  context: Record<string, string | null | undefined> = {}
): ResolvedScript {
  const byKey = new Map(claims.map((c) => [c.key, c]));

  const ordered = [...variants].sort((a, b) => a.priority - b.priority);

  for (const v of ordered) {
    const required = parseRequiredKeys(v.requiredKeysJson);

    // Varje krävd nyckel måste finnas OCH hålla måttet. Ett osäkert påstående
    // på ett skarpt samtal är värre än inget påstående alls — en säljare som
    // har fel en gång slutar lita på verktyget för alltid.
    const ok = required.every((k) => {
      const c = byKey.get(k);
      return c !== undefined && c.confidence >= v.minConfidence && claimValue(c) !== "";
    });
    if (!ok) continue;

    const usedKeys: string[] = [];
    let missing = false;

    const text = v.body.replace(PLACEHOLDER, (_full, key: string) => {
      const ctx = context[key];
      if (ctx !== undefined && ctx !== null && ctx !== "") {
        usedKeys.push(key);
        return ctx;
      }
      const c = byKey.get(key);
      if (c && c.confidence >= v.minConfidence) {
        const val = claimValue(c);
        if (val !== "") {
          usedKeys.push(key);
          return val;
        }
      }
      // En platshållare utanför kraven som ändå saknar värde diskvalificerar
      // varianten — annars läser säljaren en mening med ett hål i.
      missing = true;
      return "";
    });

    if (missing) continue;

    // Texten lämnas exakt som den skrevs. Radbrytningar och blankrader ÄR
    // manuset: de talar om var säljaren ska pausa och var ett nytt stycke
    // börjar. Ett .trim() här åt inledande radbrytningar, och renderingen
    // klämde ihop resten till en enda mening.
    return { variantId: v.id, label: v.label, text, usedKeys, empty: false };
  }

  return { variantId: null, label: null, text: "", usedKeys: [], empty: true };
}

/**
 * Kontrollerar ett manus vid redigering — vilka varianter kan aldrig visas?
 * Utan det här är det lätt att skriva fem varianter där ingen har tomma krav,
 * och upptäcka först på ett skarpt samtal att inget renderas.
 */
export function lintVariants(variants: ResolverVariant[]): string[] {
  const problems: string[] = [];
  if (variants.length === 0) return ["Inga varianter — steget visar ingenting."];

  const ordered = [...variants].sort((a, b) => a.priority - b.priority);

  const hasFallback = ordered.some((v) => parseRequiredKeys(v.requiredKeysJson).length === 0);
  if (!hasFallback) {
    problems.push(
      "Ingen variant utan datakrav. Leads som saknar underlag får inget manus alls — lägg till en sista variant med tomma krav."
    );
  }

  // Allt efter den första kravlösa varianten är onåbart.
  const firstFallback = ordered.findIndex((v) => parseRequiredKeys(v.requiredKeysJson).length === 0);
  if (firstFallback >= 0 && firstFallback < ordered.length - 1) {
    const dead = ordered.slice(firstFallback + 1).map((v) => v.label).join(", ");
    problems.push(`Visas aldrig eftersom en kravlös variant ligger före: ${dead}`);
  }

  for (const v of ordered) {
    const required = parseRequiredKeys(v.requiredKeysJson);
    const used = placeholdersIn(v.body);
    const unguarded = used.filter(
      (k) => k.includes(".") && !required.includes(k)
    );
    if (unguarded.length > 0) {
      problems.push(
        `"${v.label}" använder ${unguarded.join(", ")} utan att kräva det — varianten hoppas över när uppgiften saknas.`
      );
    }
    const unused = required.filter((k) => !used.includes(k));
    if (unused.length > 0) {
      problems.push(`"${v.label}" kräver ${unused.join(", ")} men använder det inte i texten.`);
    }
  }

  return problems;
}
