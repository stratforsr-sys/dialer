"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  resolveScript,
  lintVariants,
  type ResolverVariant,
  type ResolverClaim,
} from "@/lib/script-resolver";
import type { FrameworkStep } from "@/generated/prisma/client";

// ── Läsning ────────────────────────────────────────────────────────────────

/** Alla manus med versioner och varianter — driver adminvyn. */
export async function getScripts() {
  await requireAdmin();
  return db.scriptTemplate.findMany({
    orderBy: [{ step: "asc" }, { createdAt: "asc" }],
    include: {
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
 */
export async function getActiveScripts() {
  await requireAuth();
  const templates = await db.scriptTemplate.findMany({
    where: { active: true },
    include: {
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        include: { variants: { orderBy: { priority: "asc" } } },
      },
    },
  });

  return templates
    .filter((t) => t.versions.length > 0)
    .map((t) => ({
      templateId: t.id,
      step: t.step,
      name: t.name,
      versionId: t.versions[0].id,
      version: t.versions[0].version,
      variants: t.versions[0].variants,
    }));
}

/**
 * Renderar manusen för ett lead. Körs på servern eftersom rådata i claims
 * aldrig ska lämna den — säljaren får den färdiga meningen, inte underlaget.
 */
export async function getScriptsForLead(leadId: string) {
  const user = await requireAuth();

  const [lead, scripts] = await Promise.all([
    db.lead.findFirst({
      where: { id: leadId },
      select: {
        companyName: true,
        address: true,
        contacts: { select: { name: true, role: true }, take: 1, orderBy: { createdAt: "asc" } },
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
    getActiveScripts(),
  ]);

  if (!lead) return [];

  const claims: ResolverClaim[] = lead.dossier?.claims ?? [];
  const context = {
    företag: lead.companyName,
    kontakt: lead.contacts[0]?.name ?? null,
    roll: lead.contacts[0]?.role ?? null,
    ort: lead.address?.split(",").pop()?.trim() ?? null,
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

export async function createScriptTemplate(name: string, step: FrameworkStep) {
  const user = await requireAdmin();

  const template = await db.scriptTemplate.create({
    data: {
      name,
      step,
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
          contacts: { select: { name: true, role: true }, take: 1 },
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
    kontakt: lead?.contacts[0]?.name ?? "Anna Andersson",
    roll: lead?.contacts[0]?.role ?? "VD",
    ort: lead?.address?.split(",").pop()?.trim() ?? "Göteborg",
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
