import { prisma } from "./prisma";

export async function buildKnowledgeBase(userId: string): Promise<string> {
  const modules = await prisma.module.findMany({
    where: { userId },
    include: { techniques: { include: { ifThenPatterns: true }, orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });

  if (modules.length === 0) return "Ingen kunskapsbas tillganglig an.";

  let kb = "=== KUNSKAPSBAS: Saljtekniker fran Lion Academy ===\n\n";
  for (const mod of modules) {
    kb += `## MODUL: ${mod.name}\n`;
    if (mod.description) kb += `${mod.description}\n`;
    kb += "\n";
    for (const tech of mod.techniques) {
      kb += `### Teknik: ${tech.name}\n`;
      kb += `Beskrivning: ${tech.description}\n`;
      kb += `Nar den anvands: ${tech.whenToUse}\n`;
      kb += `Hur den anvands: ${tech.howToUse}\n`;
      if (tech.ifThenPatterns.length > 0) {
        kb += `OM-DA-monster:\n`;
        for (const pattern of tech.ifThenPatterns) {
          kb += `  - OM: ${pattern.trigger}\n`;
          kb += `    DA: ${pattern.response}\n`;
          if (pattern.context) kb += `    Kontext: ${pattern.context}\n`;
        }
      }
      kb += "\n";
    }
    kb += "---\n\n";
  }
  return kb;
}

export async function buildModuleKnowledgeBase(moduleId: string): Promise<string> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { techniques: { include: { ifThenPatterns: true }, orderBy: { order: "asc" } } },
  });
  if (!mod) return "";
  let kb = `## MODUL: ${mod.name}\n\n`;
  for (const tech of mod.techniques) {
    kb += `### Teknik: ${tech.name}\n`;
    kb += `Beskrivning: ${tech.description}\n`;
    kb += `Nar den anvands: ${tech.whenToUse}\n`;
    kb += `Hur den anvands: ${tech.howToUse}\n`;
    if (tech.ifThenPatterns.length > 0) {
      kb += `OM-DA-monster:\n`;
      for (const p of tech.ifThenPatterns) {
        kb += `  - OM: ${p.trigger}\n    DA: ${p.response}\n`;
      }
    }
    kb += "\n";
  }
  return kb;
}

export async function getWeakestTechniques(userId: string, limit = 5): Promise<WeakTechnique[]> {
  const techniques = await prisma.technique.findMany({
    where: { module: { userId } },
    include: { skillProgress: true, module: { select: { name: true } } },
  });
  return (techniques as any[]).map((t: any) => ({
    id: t.id, name: t.name, moduleName: t.module.name,
    level: t.skillProgress?.level || "beginner",
    avgScore: t.skillProgress?.avgScore || 0,
    totalReps: t.skillProgress?.totalReps || 0,
    lastPracticedAt: t.skillProgress?.lastPracticedAt || null,
  })).sort((a: any, b: any) => {
    if (a.totalReps === 0 && b.totalReps > 0) return -1;
    if (b.totalReps === 0 && a.totalReps > 0) return 1;
    return a.avgScore - b.avgScore;
  }).slice(0, limit);
}

export async function getDueRepetitions(userId: string): Promise<DueRepetition[]> {
  const now = new Date();
  const cards = await prisma.repetitionCard.findMany({
    where: { technique: { module: { userId } }, nextReviewAt: { lte: now } },
    include: { technique: { include: { module: { select: { name: true } }, skillProgress: true } } },
    orderBy: { nextReviewAt: "asc" },
  });
  return (cards as any[]).map((card: any) => ({
    cardId: card.id, techniqueId: card.techniqueId,
    techniqueName: card.technique.name, moduleName: card.technique.module.name,
    level: card.technique.skillProgress?.level || "beginner",
    daysSinceReview: card.lastReviewedAt ? Math.floor((now.getTime() - card.lastReviewedAt.getTime()) / (1000*60*60*24)) : null,
  }));
}

export interface WeakTechnique { id: string; name: string; moduleName: string; level: string; avgScore: number; totalReps: number; lastPracticedAt: Date | null; }
export interface DueRepetition { cardId: string; techniqueId: string; techniqueName: string; moduleName: string; level: string; daysSinceReview: number | null; }
