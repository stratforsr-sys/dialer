import { prisma } from "@/lib/prisma";
import { RoleplaySetupClient } from "@/components/roleplay/roleplay-setup-client";

export default async function RoleplayPage() {
  const personas = await prisma.persona.findMany({
    orderBy: { name: "asc" },
  });

  return <RoleplaySetupClient personas={personas as any} />;
}
