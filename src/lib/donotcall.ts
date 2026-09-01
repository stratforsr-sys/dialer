/**
 * Spärrlistan — den enda skrivvägen in i `DoNotCall`.
 *
 * Ligger i `lib` och inte i en server action av ett skäl: en `"use server"`-fil
 * får bara exportera async-funktioner, och **varje** sådan export blir en
 * endpoint klienten kan anropa. `blockLead` tar `userId` som parameter, så en
 * exporterad variant hade låtit vem som helst spärra vilket bolag som helst i
 * någon annans namn. Den delas i stället som vanlig modul mellan
 * `actions/dialer.ts` (dispositionen och "Inget telefonnummer") och
 * `actions/callbacks.ts` (en släppt återkomst), som var för sig gör sin egen
 * behörighetskontroll först.
 */

import { db } from "@/lib/db";

/**
 * Skriver en permanent rad i spärrlistan för ett bolag.
 *
 * Tre vägar hit, med samma krav: `BORTFALL` i dispositionen, "Inget
 * telefonnummer", och `BORTFALL` som skäl när en återkomst släpps. Alla tre
 * betyder "det här bolaget ska aldrig serveras igen", och
 * skillnaden mot att bara pensionera leadet är att spärren **överlever att
 * raden försvinner**. Ett pensionerat lead är skyddat tills någon importerar
 * bolaget på nytt; då blir det en ny rad, med ett nytt id, utan minne.
 *
 * ## Nyckeln är org-numret, inte numret och inte leadet
 *
 * Alla tre skrivs, men de håller olika länge:
 *
 * | Nyckel | Överlever radering | Överlever omimport | Finns alltid |
 * |---|---|---|---|
 * | `leadId` | nej — `onDelete: SetNull` | nej, nytt id | ja |
 * | `phoneE164` | ja | ja | **nej** — "inget nummer" har inget |
 * | `orgNumber` | ja | **ja** — importen slår ihop på det | nästan alltid |
 *
 * Därför matchar däckets spärrfilter på `leadId` **eller** `orgNumber`.
 *
 * ## Tyst när det inte går att nyckla
 *
 * Ett bolag utan både org-nummer och telefonnummer går inte att spärra
 * hållbart — det finns ingenting att känna igen det på nästa gång. Raden
 * skrivs ändå, på `leadId` ensamt: den skyddar så länge leadet finns kvar,
 * vilket är precis så länge det ändå går att skydda något. Funktionen kastar
 * aldrig; en spärr som misslyckas får inte fälla samtalet som utlöste den.
 */
export async function blockLead(params: {
  leadId: string;
  userId: string;
  reason: string;
  /** Numret som faktiskt ringdes, när det finns. */
  dialedE164?: string | null;
  orgNumber?: string | null;
}) {
  const { leadId, userId, reason } = params;

  // Numret från samtalet först, annars bolagets första kontakt med ett
  // nummer. `dialedE164` är sannast — det är det kunden blev störd på.
  // Direktnumret före växeln: en spärr på växelnumret hade kunnat träffa ett
  // helt kontorshus när numret delas, och spärrlistan är nycklad på numret.
  let phoneE164 = params.dialedE164?.trim() || null;
  if (!phoneE164) {
    const contact = await db.contact.findFirst({
      where: {
        leadId,
        OR: [{ directPhoneE164: { not: null } }, { switchboardE164: { not: null } }],
      },
      orderBy: { createdAt: "asc" },
      select: { directPhoneE164: true, switchboardE164: true },
    });
    phoneE164 = contact?.directPhoneE164 ?? contact?.switchboardE164 ?? null;
  }

  const orgNumber =
    params.orgNumber ??
    (await db.lead.findUnique({ where: { id: leadId }, select: { orgNumber: true } }))
      ?.orgNumber ??
    null;

  const data = {
    leadId,
    phoneE164,
    orgNumber,
    // Bolaget bad om det — det är vad både bortfall och ett nummerlöst bolag
    // betyder i praktiken. `MANUAL` är för admin som lägger in en rad själv.
    source: "PROSPECT_REQUEST" as const,
    reason,
    addedById: userId,
    expiresAt: null, // permanent
  };

  // `leadId` är unikt: ett bolag har en spärr, inte en per gång någon tryckte.
  // `phoneE164` är också unikt, och samma nummer kan sitta på två bolag — då
  // vinner den befintliga raden och vi nöjer oss med att spärra på leadId.
  try {
    await db.doNotCall.upsert({
      where: { leadId },
      create: data,
      update: { reason, source: data.source, expiresAt: null, orgNumber },
    });
  } catch {
    try {
      await db.doNotCall.upsert({
        where: { leadId },
        create: { ...data, phoneE164: null },
        update: { reason, source: data.source, expiresAt: null, orgNumber },
      });
    } catch {
      // Spärren är viktig men får inte fälla åtgärden som utlöste den.
      // Leadet pensioneras ändå av den som anropar — bolaget lämnar
      // rotationen; det som går förlorat är skyddet vid en framtida omimport.
    }
  }
}
