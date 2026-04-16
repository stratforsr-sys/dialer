"use server";

import { prisma } from "@/lib/prisma";
import { analyzeNotes } from "@/lib/gemini";
import { buildModuleKnowledgeBase } from "@/lib/knowledge-base";

// ============================================================
// CREATE MODULE + ANALYZE NOTES
// ============================================================
export async function createModule(
  userId: string,
  name: string,
  notes: string,
  source?: string
) {
  // 1. Create module and raw notes
  const module = await prisma.module.create({
    data: {
      userId,
      name,
      rawNotes: {
        create: {
          content: notes,
          source: source || undefined,
        },
      },
    },
  });

  // 2. Analyze notes with Gemini
  const analysis = await analyzeNotes(name, notes);

  // 3. Create techniques and IF-THEN patterns
  for (let i = 0; i < analysis.techniques.length; i++) {
    const tech = analysis.techniques[i];

    await prisma.technique.create({
      data: {
        moduleId: module.id,
        name: tech.name,
        description: tech.description,
        whenToUse: tech.whenToUse,
        howToUse: tech.howToUse,
        difficulty: tech.difficulty,
        order: i,
        ifThenPatterns: {
          create: tech.ifThenPatterns.map(p => ({
            trigger: p.trigger,
            response: p.response,
            context: p.context || null,
          })),
        },
        // Initialize skill progress
        skillProgress: {
          create: {
            level: "beginner",
            totalReps: 0,
            avgScore: 0,
            bestScore: 0,
            lastScore: 0,
            consecutiveHighScores: 0,
            totalXp: 0,
          },
        },
        // Initialize repetition card
        repetitionCard: {
          create: {
            interval: 1,
            easeFactor: 2.5,
            repetitions: 0,
            nextReviewAt: new Date(),
          },
        },
      },
    });
  }

  return { moduleId: module.id, techniquesCreated: analysis.techniques.length };
}

// ============================================================
// ADD NOTES TO EXISTING MODULE
// ============================================================
export async function addNotesToModule(
  moduleId: string,
  notes: string,
  source?: string
) {
  // 1. Get existing techniques to avoid duplicates
  const existingKb = await buildModuleKnowledgeBase(moduleId);
  const module = await prisma.module.findUnique({ where: { id: moduleId } });

  if (!module) throw new Error("Module not found");

  // 2. Save raw notes
  await prisma.rawNote.create({
    data: {
      moduleId,
      content: notes,
      source: source || undefined,
    },
  });

  // 3. Analyze new notes (with existing techniques context)
  const analysis = await analyzeNotes(module.name, notes, existingKb);

  // 4. Get current max order
  const maxOrder = await prisma.technique.count({ where: { moduleId } });

  // 5. Create new techniques
  let created = 0;
  for (let i = 0; i < analysis.techniques.length; i++) {
    const tech = analysis.techniques[i];

    await prisma.technique.create({
      data: {
        moduleId,
        name: tech.name,
        description: tech.description,
        whenToUse: tech.whenToUse,
        howToUse: tech.howToUse,
        difficulty: tech.difficulty,
        order: maxOrder + i,
        ifThenPatterns: {
          create: tech.ifThenPatterns.map(p => ({
            trigger: p.trigger,
            response: p.response,
            context: p.context || null,
          })),
        },
        skillProgress: {
          create: {
            level: "beginner",
            totalReps: 0,
            avgScore: 0,
            bestScore: 0,
            lastScore: 0,
            consecutiveHighScores: 0,
            totalXp: 0,
          },
        },
        repetitionCard: {
          create: {
            interval: 1,
            easeFactor: 2.5,
            repetitions: 0,
            nextReviewAt: new Date(),
          },
        },
      },
    });
    created++;
  }

  return { newTechniques: created };
}

// ============================================================
// UPDATE TECHNIQUE (user edits AI extraction)
// ============================================================
export async function updateTechnique(
  techniqueId: string,
  data: {
    name?: string;
    description?: string;
    whenToUse?: string;
    howToUse?: string;
    difficulty?: string;
  }
) {
  return prisma.technique.update({
    where: { id: techniqueId },
    data,
  });
}

// ============================================================
// UPDATE IF-THEN PATTERN
// ============================================================
export async function updateIfThenPattern(
  patternId: string,
  data: {
    trigger?: string;
    response?: string;
    context?: string;
  }
) {
  return prisma.ifThenPattern.update({
    where: { id: patternId },
    data,
  });
}

// ============================================================
// DELETE TECHNIQUE
// ============================================================
export async function deleteTechnique(techniqueId: string) {
  return prisma.technique.delete({
    where: { id: techniqueId },
  });
}

// ============================================================
// GET ALL MODULES WITH PROGRESS
// ============================================================
export async function getModulesWithProgress(userId: string) {
  const modules = await prisma.module.findMany({
    where: { userId },
    include: {
      techniques: {
        include: {
          skillProgress: true,
          repetitionCard: true,
        },
      },
      _count: { select: { rawNotes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (modules as any[]).map((mod: any) => {
    const techniques = mod.techniques as any[];
    const avgLevel = techniques.reduce((sum: number, t: any) => {
      const levelValues: Record<string, number> = {
        beginner: 1, advanced: 2, competent: 3, skilled: 4, expert: 5,
      };
      return sum + (levelValues[t.skillProgress?.level || "beginner"] || 1);
    }, 0) / (techniques.length || 1);

    const nextReview = techniques
      .map((t: any) => t.repetitionCard?.nextReviewAt)
      .filter(Boolean)
      .sort((a: any, b: any) => (a.getTime() - b.getTime()))[0];

    return {
      id: mod.id,
      name: mod.name,
      description: mod.description,
      techniqueCount: techniques.length,
      noteCount: mod._count?.rawNotes || 0,
      avgLevel: Math.round(avgLevel * 10) / 10,
      avgLevelLabel: getLevelLabel(avgLevel),
      nextReview,
      lastTrained: techniques
        .map((t: any) => t.skillProgress?.lastPracticedAt)
        .filter(Boolean)
        .sort((a: any, b: any) => b.getTime() - a.getTime())[0] || null,
    };
  });
}

function getLevelLabel(avg: number): string {
  if (avg >= 4.5) return "Expert";
  if (avg >= 3.5) return "Skicklig";
  if (avg >= 2.5) return "Kompetent";
  if (avg >= 1.5) return "Avancerad";
  return "Nyborjare";
}
