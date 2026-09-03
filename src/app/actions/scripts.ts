"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  resolveScript,
  lintVariants,
  firstNameOf,
  type ResolverVariant,
  type ResolverClaim,
} from "@/lib/script-resolver";
import type { FrameworkStep } from "@/generated/prisma/client";

// ── Läsning ────────────────────────────────────────────────────────────────

/**
 * Alla manus med versioner och varianter — driver adminvyn.
 *
 * Arkiverade följer med: adminvyn visar dem i en egen hopfälld sektion, och
 * utan dem gick de inte att ta fram igen. Det var precis vad som hände med de
 * manus `deleteList` stängde av — de blev osynliga och det fanns ingen knapp
 * någonstans som kunde slå på dem.
 */
export async function getScripts() {
  await requireAdmin();
  return db.scriptTemplate.findMany({
    // Allmänna manus först (listId NULL sorterar först), sedan mappmanusen —
    // samma ordning som adminvyn grupperar dem i. Inom mappen samma ordning
    // som säljaren ser dem i cockpiten.
    orderBy: [{ listId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      list: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: "desc" },
        include: { variants: { orderBy: { priority: "asc" } } },
      },
    },
  });
}

/**
 * De publicerade manusen säljaren ska se. Opublicerade utkast syns aldrig.
 *
 * `listId` är mappen säljaren ringer i, och regeln är:
 *
 *   **har mappen egna manus gäller BARA de, annars gäller de allmänna.**
 *
 * Ersätter, inte kompletterar. Fram till 2026-09-03 matchade ersättningen på
 * `step`: mappens intro-manus tog över det allmänna intro-manuset, medan
 * övriga steg föll tillbaka. Det förutsätter att steget beskriver innehållet,
 * och det gör det inte — i praktiken skrivs ett helt manus per kampanj och
 * hamnar under ett godtyckligt steg. Följden var att en säljare i
 * hantverkare_5000_alla fick samma text två gånger: en gång som "ROI" (mappens
 * manus) och en gång som "Intro" (det allmänna). Två manus på skärmen samtidigt
 * är samma sak som inget manus, för ingen läser två alternativ mitt i ett
 * samtal.
 *
 * En mapp som bara vill ändra öppningen kopierar därför det allmänna manuset
 * till sig först (`duplicateTemplate`) och redigerar kopian. Det är ett steg
 * mer att skriva, och till skillnad från steg-matchningen går det att förklara
 * för den som ska använda det.
 *
 * Utan listId (ett bolag öppnat direkt i dialern, utan ringlista) gäller bara
 * de allmänna manusen: ett mappmanus är skrivet för mappens bolag och ska inte
 * läcka ut på ett godtyckligt lead.
 */
export async function getActiveScripts(listId?: string | null) {
  await requireAuth();
  const templates = await db.scriptTemplate.findMany({
    where: {
      active: true,
      archived: false,
      ...(listId ? { OR: [{ listId: null }, { listId }] } : { listId: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        include: { variants: { orderBy: { priority: "asc" } } },
      },
    },
  });

  const publishable = templates.filter((t) => t.versions.length > 0);

  // Har mappen skrivit något eget är det mappens manus som gäller där. Bara
  // när den inte gjort det faller säljaren tillbaka på de allmänna.
  const own = publishable.filter((t) => t.listId !== null);
  const effective = own.length > 0 ? own : publishable.filter((t) => t.listId === null);

  return effective.map((t) => ({
    templateId: t.id,
    step: t.step,
    name: t.name,
    listId: t.listId,
    versionId: t.versions[0].id,
    version: t.versions[0].version,
    variants: t.versions[0].variants,
  }));
}

/**
 * Renderar manusen för ett lead. Körs på servern eftersom rådata i claims
 * aldrig ska lämna den — säljaren får den färdiga meningen, inte underlaget.
 */
export async function getScriptsForLead(leadId: string, listId?: string | null) {
  const user = await requireAuth();

  const [lead, scripts] = await Promise.all([
    db.lead.findFirst({
      where: { id: leadId },
      select: {
        companyName: true,
        address: true,
        city: true,
        contacts: {
          select: { name: true, firstName: true, role: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
        dossier: {
          select: {
            claims: {
              select: {
                key: true, valueNum: true, valueStr: true,
                valueBool: true, unit: true, confidence: true,
              },
            },
          },
        },
      },
    }),
    getActiveScripts(listId),
  ]);

  if (!lead) return [];

  const claims: ResolverClaim[] = lead.dossier?.claims ?? [];
  const context = {
    företag: lead.companyName,
    // Tilltalsnamn, inte hela namnet — se firstNameOf i script-resolver.
    kontakt: firstNameOf(lead.contacts[0]?.firstName, lead.contacts[0]?.name),
    förnamn: firstNameOf(lead.contacts[0]?.firstName, lead.contacts[0]?.name),
    fullnamn: lead.contacts[0]?.name ?? null,
    roll: lead.contacts[0]?.role ?? null,
    // city först — address-splitten är kvar som fallback för leads som
    // importerades innan ortkolumnen fanns.
    ort: lead.city ?? lead.address?.split(",").pop()?.trim() ?? null,
    säljare: user.name,
  };

  return scripts.map((s) => ({
    templateId: s.templateId,
    step: s.step,
    name: s.name,
    versionId: s.versionId,
    resolved: resolveScript(s.variants as ResolverVariant[], claims, context),
  }));
}

// ── Skrivning (endast admin) ───────────────────────────────────────────────

/**
 * Sist i ordningen inom sin mapp. Ett nytt manus ska hamna under de befintliga,
 * inte mitt i dem — säljaren har lärt sig var de ligger.
 */
async function nextSortOrder(listId: string | null) {
  const last = await db.scriptTemplate.findFirst({
    where: { listId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 10;
}

export async function createScriptTemplate(
  name: string,
  step: FrameworkStep,
  listId?: string | null
) {
  const user = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Manuset måste ha ett namn");

  if (listId) {
    const list = await db.callList.findUnique({ where: { id: listId }, select: { id: true } });
    if (!list) throw new Error("Mappen finns inte");
  }

  const template = await db.scriptTemplate.create({
    data: {
      name: trimmed,
      step,
      listId: listId ?? null,
      sortOrder: await nextSortOrder(listId ?? null),
      createdById: user.id,
      versions: {
        create: {
          version: 1,
          variants: {
            create: {
              label: "Standard",
              priority: 99,
              body: "",
              requiredKeysJson: "[]",
            },
          },
        },
      },
    },
    include: { versions: { include: { variants: true } } },
  });

  revalidatePath("/admin/scripts");
  return template;
}

/**
 * Byter namn på manuset.
 *
 * Namnet gick tidigare inte att ändra alls — det sattes automatiskt vid
 * skapandet ur steg + mappnamn och blev sedan liggande. Tre av fyra manus i
 * produktion hette därför något som inte längre stämde ("Intro —
 * leads_bygg_hantverk" på ett manus som gällde alla mappar), och namnet är vad
 * säljaren ser som rubrik.
 */
export async function renameTemplate(templateId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Manuset måste ha ett namn");
  await db.scriptTemplate.update({ where: { id: templateId }, data: { name: trimmed } });
  revalidatePath("/admin/scripts");
  return { ok: true as const };
}

/**
 * Skapar ett utkast ovanpå senaste versionen.
 *
 * En publicerad version ändras aldrig. Utan det pekar gammal statistik på text
 * som inte längre finns, och A/B-testet blir meningslöst efter första
 * redigeringen.
 */
export async function createDraftVersion(templateId: string) {
  await requireAdmin();

  const latest = await db.scriptVersion.findFirst({
    where: { templateId },
    orderBy: { version: "desc" },
    include: { variants: { orderBy: { priority: "asc" } } },
  });
  if (!latest) throw new Error("Manuset saknar versioner");

  // Finns redan ett opublicerat utkast, återanvänd det.
  if (!latest.publishedAt) return latest;

  const draft = await db.scriptVersion.create({
    data: {
      templateId,
      version: latest.version + 1,
      variants: {
        create: latest.variants.map((v) => ({
          label: v.label,
          priority: v.priority,
          body: v.body,
          requiredKeysJson: v.requiredKeysJson,
          minConfidence: v.minConfidence,
        })),
      },
    },
    include: { variants: { orderBy: { priority: "asc" } } },
  });

  revalidatePath("/admin/scripts");
  return draft;
}

export async function saveVariants(
  versionId: string,
  variants: Array<{
    id?: string;
    label: string;
    priority: number;
    body: string;
    requiredKeys: string[];
    minConfidence: number;
  }>
) {
  await requireAdmin();

  const version = await db.scriptVersion.findUnique({
    where: { id: versionId },
    select: { publishedAt: true },
  });
  if (!version) throw new Error("Versionen finns inte");
  if (version.publishedAt) {
    throw new Error("Publicerade versioner kan inte ändras — skapa ett nytt utkast");
  }

  // Ersätt hela uppsättningen: enklare och säkrare än att synka diffar, och
  // med en handfull varianter per steg är kostnaden noll.
  await db.$transaction([
    db.scriptVariant.deleteMany({ where: { versionId } }),
    db.scriptVariant.createMany({
      data: variants.map((v) => ({
        versionId,
        label: v.label,
        priority: v.priority,
        body: v.body,
        requiredKeysJson: JSON.stringify(v.requiredKeys),
        minConfidence: v.minConfidence,
      })),
    }),
  ]);

  revalidatePath("/admin/scripts");
  return { ok: true };
}

/** Publicerar utkastet. Kontrollerar först att det faktiskt går att rendera. */
export async function publishVersion(versionId: string) {
  await requireAdmin();

  const version = await db.scriptVersion.findUnique({
    where: { id: versionId },
    include: { variants: true },
  });
  if (!version) throw new Error("Versionen finns inte");

  const problems = lintVariants(version.variants as ResolverVariant[]);
  // Bara det blockerande felet stoppar publicering — resten är varningar som
  // adminvyn redan visar.
  const blocking = problems.filter((p) => p.includes("utan datakrav") || p.includes("Inga varianter"));
  if (blocking.length > 0) {
    return { ok: false as const, problems: blocking };
  }

  await db.scriptVersion.update({
    where: { id: versionId },
    data: { publishedAt: new Date() },
  });

  revalidatePath("/admin/scripts");
  return { ok: true as const, problems: [] };
}

/**
 * Pausar eller återstartar manuset.
 *
 * Att slå PÅ lyfter också arkiveringen: ett arkiverat manus som någon aktivt
 * väljer att starta är inte längre arkiverat, och två avstängningsflaggor där
 * den ena tyst åsidosätter den andra är hur ett manus blir omöjligt att få
 * igång igen.
 */
export async function setTemplateActive(templateId: string, active: boolean) {
  await requireAdmin();
  await db.scriptTemplate.update({
    where: { id: templateId },
    data: active ? { active: true, archived: false } : { active: false },
  });
  revalidatePath("/admin/scripts");
  revalidatePath("/lists");
  return { ok: true as const };
}

/**
 * Arkiverar eller tar fram manuset.
 *
 * Ett arkiverat manus delas aldrig ut till en säljare och ligger utanför
 * listan, men texten och versionerna finns kvar — de bär statistikens koppling
 * till vad som faktiskt sades i tusentals samtal.
 */
export async function setTemplateArchived(templateId: string, archived: boolean) {
  await requireAdmin();
  await db.scriptTemplate.update({
    where: { id: templateId },
    // Arkivering stänger av. Ett arkiverat men "aktivt" manus är ett manus som
    // kommer tillbaka i cockpiten i samma sekund någon tar fram det ur arkivet
    // för att bara titta på texten.
    data: archived ? { archived: true, active: false } : { archived: false },
  });
  revalidatePath("/admin/scripts");
  revalidatePath("/lists");
  return { ok: true as const };
}

/**
 * Flyttar manuset ett steg upp eller ner i sin mapp — ordningen säljaren ser.
 *
 * Byter plats på sortOrder med grannen i stället för att räkna om hela listan:
 * två skrivningar, och ordningen blir densamma oavsett hur många gånger någon
 * klickar.
 */
export async function moveTemplateOrder(templateId: string, direction: "up" | "down") {
  await requireAdmin();

  const me = await db.scriptTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, listId: true, sortOrder: true, createdAt: true },
  });
  if (!me) throw new Error("Manuset finns inte");

  const siblings = await db.scriptTemplate.findMany({
    where: { listId: me.listId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });

  const i = siblings.findIndex((s) => s.id === templateId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return { ok: false as const };

  const neighbour = siblings[j];
  // Ligger de på samma tal (allt startar på 0) räcker det inte att byta värden.
  // Skriv om hela mappen med jämna mellanrum först, så finns det något att byta.
  if (neighbour.sortOrder === me.sortOrder) {
    await db.$transaction(
      siblings.map((s, idx) =>
        db.scriptTemplate.update({ where: { id: s.id }, data: { sortOrder: idx * 10 } })
      )
    );
    await db.$transaction([
      db.scriptTemplate.update({ where: { id: templateId }, data: { sortOrder: j * 10 } }),
      db.scriptTemplate.update({ where: { id: neighbour.id }, data: { sortOrder: i * 10 } }),
    ]);
  } else {
    await db.$transaction([
      db.scriptTemplate.update({ where: { id: templateId }, data: { sortOrder: neighbour.sortOrder } }),
      db.scriptTemplate.update({ where: { id: neighbour.id }, data: { sortOrder: me.sortOrder } }),
    ]);
  }

  revalidatePath("/admin/scripts");
  return { ok: true as const };
}

/**
 * Kopierar manuset till en annan mapp — eller till "alla mappar".
 *
 * Behövs sedan mappens manus ersätter de allmänna helt. En kampanj som bara
 * vill ändra öppningen kan inte längre luta sig mot att de allmänna stegen
 * följer med; den kopierar det allmänna manuset hit och redigerar kopian.
 *
 * Kopian är ett **utkast**, aldrig publicerad. Den ärver bara den senaste
 * publicerade textens varianter — versionshistoriken hör till originalet och
 * till statistiken som pekar på den, och en kopierad historik hade påstått att
 * den här texten sagts i samtal den aldrig varit med i.
 */
export async function duplicateTemplate(templateId: string, listId: string | null) {
  const user = await requireAdmin();

  const source = await db.scriptTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: {
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        take: 1,
        include: { variants: { orderBy: { priority: "asc" } } },
      },
    },
  });
  if (!source) throw new Error("Manuset finns inte");

  if (listId) {
    const list = await db.callList.findUnique({ where: { id: listId }, select: { id: true } });
    if (!list) throw new Error("Mappen finns inte");
  }

  const variants = source.versions[0]?.variants ?? [];

  const copy = await db.scriptTemplate.create({
    data: {
      name: `${source.name} (kopia)`,
      step: source.step,
      listId,
      sortOrder: await nextSortOrder(listId),
      // Kopian är avstängd tills någon publicerat den. Ett halvfärdigt manus
      // som slår igång i mappen i samma sekund det skapas är inte en kopia,
      // det är en olycka.
      active: false,
      createdById: user.id,
      versions: {
        create: {
          version: 1,
          variants: {
            create: variants.map((v) => ({
              label: v.label,
              priority: v.priority,
              body: v.body,
              requiredKeysJson: v.requiredKeysJson,
              minConfidence: v.minConfidence,
            })),
          },
        },
      },
    },
  });

  revalidatePath("/admin/scripts");
  return copy;
}

/**
 * Kastar ett opublicerat utkast.
 *
 * Ett utkast gick tidigare bara att ta sig ur genom att publicera det. Växel
 * hade legat med ett hängande utkast som version 17 sedan länge av just det
 * skälet. Publicerade versioner rörs aldrig, och det sista utkastet på ett
 * manus utan publicerad version får inte heller kastas — då står manuset utan
 * text att redigera.
 */
export async function discardDraft(versionId: string) {
  await requireAdmin();

  const version = await db.scriptVersion.findUnique({
    where: { id: versionId },
    select: { id: true, templateId: true, publishedAt: true },
  });
  if (!version) throw new Error("Versionen finns inte");
  if (version.publishedAt) throw new Error("Publicerade versioner kan inte kastas");

  const others = await db.scriptVersion.count({
    where: { templateId: version.templateId, id: { not: versionId } },
  });
  if (others === 0) {
    return {
      ok: false as const,
      reason: "Det här är manusets enda version — radera manuset i stället.",
    };
  }

  await db.scriptVersion.delete({ where: { id: versionId } });
  revalidatePath("/admin/scripts");
  return { ok: true as const, reason: null };
}

/**
 * Flyttar manuset mellan "alla mappar" och en enskild mapp.
 *
 * Ändrar bara vem som får texten, aldrig texten själv — publicerade versioner
 * är oföränderliga och statistiken pekar på dem. Ett manus som skrivits för en
 * kampanj kan alltså lyftas till att gälla alla utan att någon rad skrivs om.
 */
export async function setTemplateList(templateId: string, listId: string | null) {
  await requireAdmin();

  if (listId) {
    const list = await db.callList.findUnique({ where: { id: listId }, select: { id: true } });
    if (!list) throw new Error("Mappen finns inte");
  }

  // Ordningen hör till mappen manuset ligger i. Följer den med över blir den
  // godtycklig i den nya mappen — sist är rätt gissning för något som just
  // flyttat in.
  await db.scriptTemplate.update({
    where: { id: templateId },
    data: { listId, sortOrder: await nextSortOrder(listId) },
  });
  revalidatePath("/admin/scripts");
  revalidatePath("/lists");
  return { ok: true as const };
}

/**
 * Mapparna manus kan knytas till, med antal manus per mapp.
 *
 * Arkiverade tas med: ett manus kan mycket väl höra till en mapp som lagts
 * undan, och då ska den ändå gå att se i väljaren i stället för att raden
 * visar ett tomt namn.
 */
export async function getListsForScripts() {
  await requireAdmin();
  const lists = await db.callList.findMany({
    select: {
      id: true,
      name: true,
      archived: true,
      _count: {
        select: {
          // Bara de som faktiskt gäller i mappen. Räknas arkiverade med säger
          // siffran att mappen har ett eget manus när den inte har det, och
          // det är just den siffran som avgör om de allmänna används där.
          scripts: { where: { archived: false } },
          leads: true,
        },
      },
    },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    archived: l.archived,
    scriptCount: l._count.scripts,
    leadCount: l._count.leads,
  }));
}

/**
 * Ett lead ur mappen att förhandsgranska mot.
 *
 * Ett mappmanus skrivs för mappens bolag, och att granska det mot ett
 * godtyckligt lead ur en annan mapp visar fel varianter — det är underlaget som
 * avgör vilken variant som vinner. Helst ett lead med dossier, annars vilket
 * som helst i mappen.
 */
export async function getSampleLeadForList(listId: string) {
  await requireAdmin();
  const withDossier = await db.lead.findFirst({
    where: { lists: { some: { listId } }, dossier: { isNot: null } },
    select: { id: true, companyName: true },
  });
  if (withDossier) return withDossier;
  return db.lead.findFirst({
    where: { lists: { some: { listId } } },
    select: { id: true, companyName: true },
  });
}

/**
 * Tar bort manuset — på riktigt om det aldrig använts, annars genom arkivering.
 *
 * Versioner som legat på ett samtal får inte försvinna: `CallAttempt`
 * är statistikens nämnare och `scriptVersionId` är hela kopplingen mellan ett
 * utfall och den text som faktiskt lästes upp. Raderas texten går frågan
 * "vilken formulering sålde bäst" inte längre att svara på i efterhand.
 *
 * Skillnaden syns för den som klickar: ett oanvänt manus försvinner, ett använt
 * flyttas till arkivet och går att läsa där. Båda är "borta" ur listan, och det
 * är det som efterfrågades.
 */
export async function deleteTemplate(templateId: string) {
  await requireAdmin();

  const used = await db.callAttempt.findFirst({
    where: { scriptVersion: { templateId } },
    select: { id: true },
  });

  if (used) {
    await db.scriptTemplate.update({
      where: { id: templateId },
      data: { archived: true, active: false },
    });
    revalidatePath("/admin/scripts");
    revalidatePath("/lists");
    return {
      ok: true as const,
      archived: true as const,
      reason:
        "Manuset har lästs upp i riktiga samtal, så texten måste finnas kvar för statistiken. Det ligger i arkivet och syns inte längre för någon säljare.",
    };
  }

  await db.scriptTemplate.delete({ where: { id: templateId } });
  revalidatePath("/admin/scripts");
  revalidatePath("/lists");
  return { ok: true as const, archived: false as const, reason: null };
}

/** Förhandsgranskning mot ett riktigt lead. */
export async function previewVariants(
  variants: Array<{ label: string; priority: number; body: string; requiredKeys: string[]; minConfidence: number }>,
  leadId: string | null
) {
  const user = await requireAdmin();

  const resolverVariants: ResolverVariant[] = variants.map((v, i) => ({
    id: `preview-${i}`,
    label: v.label,
    priority: v.priority,
    body: v.body,
    requiredKeysJson: JSON.stringify(v.requiredKeys),
    minConfidence: v.minConfidence,
  }));

  const lead = leadId
    ? await db.lead.findUnique({
        where: { id: leadId },
        select: {
          companyName: true,
          address: true,
          city: true,
          contacts: { select: { name: true, firstName: true, role: true }, take: 1 },
          dossier: {
            select: {
              claims: {
                select: { key: true, valueNum: true, valueStr: true, valueBool: true, unit: true, confidence: true },
              },
            },
          },
        },
      })
    : null;

  const claims: ResolverClaim[] = lead?.dossier?.claims ?? [];
  const context = {
    företag: lead?.companyName ?? "Exempelbolaget AB",
    kontakt: firstNameOf(lead?.contacts[0]?.firstName, lead?.contacts[0]?.name) ?? "Anna",
    förnamn: firstNameOf(lead?.contacts[0]?.firstName, lead?.contacts[0]?.name) ?? "Anna",
    fullnamn: lead?.contacts[0]?.name ?? "Anna Andersson",
    roll: lead?.contacts[0]?.role ?? "VD",
    ort: lead?.city ?? lead?.address?.split(",").pop()?.trim() ?? "Göteborg",
    säljare: user.name,
  };

  return {
    resolved: resolveScript(resolverVariants, claims, context),
    problems: lintVariants(resolverVariants),
    claimKeys: claims.map((c) => ({ key: c.key, confidence: c.confidence })),
    usedLead: lead?.companyName ?? null,
  };
}

/** Nycklar som finns i databasen — förslag när chefen skriver krav. */
export async function getAvailableClaimKeys() {
  await requireAdmin();
  const rows = await db.leadClaim.groupBy({
    by: ["key"],
    _count: { key: true },
    orderBy: { _count: { key: "desc" } },
  });
  return rows.map((r) => ({ key: r.key, count: r._count.key }));
}
