/**
 * Sammanslagningen av anteckningar och samtal — ren logik, inget UI.
 *
 * Ligger här och inte i `LeadHistory` av samma skäl som `cockpit-flow.ts`:
 * regeln nedan går att få subtilt fel på ett sätt som ingen upptäcker förrän
 * en säljare undrar var hens anteckning tog vägen, och den enda försvaret mot
 * det är att den går att köra i ett test.
 *
 * ## Regeln
 *
 * En anteckning skriven i cockpiten med Enter sparas direkt och syns som en
 * egen rad. Sätter säljaren sedan ett utfall på samtalet **försvinner den egna
 * raden och texten flyttar in under utfallet** — kvar står "Sa nej · Pris",
 * med anteckningen en klickning bort.
 *
 * Sammanslagningen sker vid läsning. Ingenting muteras och ingen rad tas bort;
 * aktivitetsloggen är oföränderlig.
 *
 * ## Varför kopplingen är `sessionId` och inte tid
 *
 * Första utkastet lät en anteckning höra till nästa samtal på leadet, punkt.
 * Det är fel: en anteckning som lämnats utan utfall hade sugits in i nästa
 * samtal på bolaget, som kan ligga dagar bort och tillhöra en annan säljare.
 * En anteckning hör därför bara till ett samtal i **samma ringpass**.
 *
 * `source: "cockpit"` bär den andra halvan. Anteckningar skrivna på lead-sidan
 * saknar märkningen och fälls aldrig ihop med någonting — de är en egen
 * handling, inte en del av ett samtal.
 *
 * Finns inget matchande samtal ligger anteckningen kvar som egen rad, för
 * alltid. Skrev någon ned något är det värt att behålla.
 */

export interface MergeAttempt {
  id: string;
  at: Date;
  /** Vilket ringpass samtalet gjordes i. Null för rader äldre än funktionen —
   *  de får aldrig svälja någon anteckning. */
  sessionId?: string | null;
  /** Anteckningen som skickades med dispositionen. */
  note: string | null;
}

export interface MergeActivity {
  id: string;
  at: Date;
  metadata: string | null;
  who: string;
}

export interface StandaloneNote {
  id: string;
  at: Date;
  note: string;
  who: string;
}

export interface MergeResult {
  /** Sammanslagen anteckningstext per samtal — dispositionens egen först,
   *  sedan de Enter-sparade i skrivordning. `null` när samtalet är utan text. */
  noteForAttempt: Map<string, string | null>;
  /** Anteckningar som inte hör till något samtal och står för sig själva. */
  standalone: StandaloneNote[];
}

/** Innehållet i en Activitys metadata. Trasig JSON tystas — loggen får aldrig
 *  fälla cockpiten. */
export function parseNoteMetadata(
  metadata: string | null
): { note: string | null; source: string | null; sessionId: string | null } {
  if (!metadata) return { note: null, source: null, sessionId: null };
  try {
    const p = JSON.parse(metadata) as {
      note?: string;
      notes?: string;
      source?: string;
      sessionId?: string | null;
    };
    return {
      note: p.note ?? p.notes ?? null,
      source: p.source ?? null,
      sessionId: p.sessionId ?? null,
    };
  } catch {
    return { note: null, source: null, sessionId: null };
  }
}

export function mergeCockpitNotes(
  attempts: MergeAttempt[],
  activities: MergeActivity[]
): MergeResult {
  // Samtalen i tidsordning, så varje anteckning kan hitta det närmaste
  // samtalet efter sig.
  const calls = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());

  const absorbed = new Map<string, string[]>();
  const standalone: StandaloneNote[] = [];

  for (const act of activities) {
    const meta = parseNoteMetadata(act.metadata);
    if (!meta.note) continue;

    const owner =
      meta.source === "cockpit" && meta.sessionId
        ? calls.find(
            (c) => c.sessionId === meta.sessionId && c.at.getTime() >= act.at.getTime()
          )
        : undefined;

    if (owner) {
      const list = absorbed.get(owner.id) ?? [];
      list.push(meta.note);
      absorbed.set(owner.id, list);
      continue;
    }

    standalone.push({ id: act.id, at: act.at, note: meta.note, who: act.who });
  }

  const noteForAttempt = new Map<string, string | null>();
  for (const c of calls) {
    const parts = [c.note, ...(absorbed.get(c.id) ?? [])].filter(
      (p): p is string => Boolean(p)
    );
    noteForAttempt.set(c.id, parts.length > 0 ? parts.join("\n\n") : null);
  }

  return { noteForAttempt, standalone };
}
