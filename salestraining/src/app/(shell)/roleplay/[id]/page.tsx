import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { RoleplayChatClient } from "@/components/roleplay/roleplay-chat-client";

export default async function RoleplayChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const roleplay = await prisma.roleplaySession.findUnique({
    where: { id },
    include: {
      persona: true,
      scorecard: true,
    },
  });

  if (!roleplay) notFound();

  return <RoleplayChatClient roleplay={roleplay as any} />;
}
