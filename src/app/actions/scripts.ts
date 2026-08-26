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

/** Alla manus med versioner och varianter — driver adminvyn. */
export async function getScripts() {
  await requireAdmin();
  return db.scriptTemplate.findMany({
    // Allmänna manus först (listId NULL sorterar först), sedan mappmanusen —
    // samma ordning som adminvyn grupperar dem i.
    orderBy: [{ listId: "asc" }, { step: "asc" }, { createdAt: "asc" }],
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
 * De publicerade manusen, ett per steg. Det här är vad cockpit läser.
 * Opublicerade utkast syns aldrig för säljarna.
 *
 * `listId` är mappen säljaren ringer i. Har mappen ett eget manus för ett steg
 * **ersätter** det det allmänna för just det steget — det kompletterar det
 * inte. Två manus för samma steg på skärmen samtidigt är samma sak som inget
 * manus, för ingen läser två alternativ mitt i ett samtal. Steg där mappen
 * inte skrivit något faller tillbaka på det allmänna, så en kampanj bara
 * behöver skriva om det som faktiskt skiljer sig — oftast öppningen.
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
      ...(listId ? { OR: [{ listId: null }, { listId }] } : { listId: null }),
    },
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

  // Steg där mappen skrivit ett eget manus. Bara de stegen tappar sitt
  // allmänna manus — resten är oförändrade.
  const overridden = new Set(
    publishable.filter((t) => t.listId !== null).map((t) => t.step)
  );

  return publishable
    .filter((t) => t.listId !== null || !overridden.has(t.step))
    .map((t) => ({
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
    step: s.step,
    name: s.name,
    versionId: s.versionId,
    resolved: resolveScript(s.variants as ResolverVariant[], claims, context),
  }));
}

// ── Skrivning (endast admin) ───────────────────────────────────────────────

export async function createScriptTemplate(
  name: string,
  step: FrameworkStep,
  listId?: string | null
) {
  const user = await requireAdmin();

  if (listId) {
    const list = await db.callList.findUnique({ where: { id: listId }, select: { id: true } });
    if (!list) throw new Error("Mappen finns inte");
  }

  const template = await db.scriptTemplate.create({
    data: {
      name,
      step,
      listId: listId ?? null,
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

export async function setTemplateActive(templateId: string, active: boolean) {
  await requireAdmin();
  await db.scriptTemplate.update({ where: { id: templateId }, data: { active } });
  revalidatePath("/admin/scripts");
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

  await db.scriptTemplate.update({
    where: { id: templateId },
    data: { listId },
  });
  revalidatePath("/admin/scripts");
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
      _count: { select: { scripts: true, leads: true } },
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

export async function deleteTemplate(templateId: string) {
  await requireAdmin();
  // Versioner som använts av samtal får inte försvinna — då tappar statistiken
  // sin koppling till texten. Inaktivera i stället.
  const used = await db.callAttempt.findFirst({
    where: { scriptVersion: { templateId } },
    select: { id: true },
  });
  if (used) {
    await db.scriptTemplate.update({ where: { id: templateId }, data: { active: false } });
    return { ok: false as const, reason: "Manuset har använts i samtal — det inaktiverades i stället för att raderas." };
  }
  await db.scriptTemplate.delete({ where: { id: templateId } });
  revalidatePath("/admin/scripts");
  return { ok: true as const };
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
