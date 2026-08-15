import { Suspense } from "react";
import { getCoachingBoard } from "@/app/actions/coaching";
import { requireAuth } from "@/lib/auth";
import { CoachingView } from "@/components/coaching/CoachingView";

export const dynamic = "force-dynamic";

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const user = await requireAuth();

  // Bara de tre knapparna i vyn är giltiga. Ett godtyckligt tal i URL:en hade
  // låtit vem som helst be om 3 650 dagar och läsa hela tabellen i en fråga.
  const allowed = [1, 7, 30];
  const range = allowed.includes(Number(days)) ? Number(days) : 7;

  const board = await getCoachingBoard(range);

  return (
    <Suspense>
      <CoachingView board={board} isAdmin={user.role === "ADMIN"} />
    </Suspense>
  );
}
