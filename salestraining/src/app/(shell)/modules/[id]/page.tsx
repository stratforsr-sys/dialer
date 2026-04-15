import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ModuleDetailClient } from "@/components/modules/module-detail-client";

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const mod = await prisma.module.findUnique({
    where: { id },
    include: {
      techniques: {
        include: {
          ifThenPatterns: true,
          skillProgress: true,
          repetitionCard: true,
        },
        orderBy: { order: "asc" },
      },
      rawNotes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, source: true, createdAt: true },
      },
    },
  });

  if (!mod) notFound();

  return <ModuleDetailClient module={mod as any} />;
}
