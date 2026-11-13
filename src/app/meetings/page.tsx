import { requireAuth } from "@/lib/auth";
import { listMeetings, listMeetingHolders, getMeetingBoard } from "@/app/actions/meetings";
import { MeetingsView } from "@/components/meetings/MeetingsView";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";
  const wanted = scope === "floor" && isAdmin ? "floor" : "mine";

  const [list, holders, board] = await Promise.all([
    listMeetings(wanted),
    listMeetingHolders(),
    // Tabellen per säljare bara i golvvyn: säljaren har sina egna tal överst.
    wanted === "floor" ? getMeetingBoard(30) : Promise.resolve(null),
  ]);

  return (
    <MeetingsView
      open={list.open}
      recent={list.recent}
      scope={list.scope}
      isAdmin={list.isAdmin}
      userId={list.userId}
      holders={holders}
      board={board ? { rows: board.rows, callsBy: board.callsBy } : null}
    />
  );
}
