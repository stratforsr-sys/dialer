import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { renewLeases } from "@/app/actions/dialer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Förnyelsen av arbetslåsen — som route handler, inte som server action.
 *
 * Går var femte minut och vid varje `visibilitychange`, alltså varje gång
 * säljaren växlar tillbaka till fliken — och det är just då den är som dyrast:
 * instansen har hunnit gå kall medan fliken låg dold. Som server action stod
 * den i samma seriella kö som allt annat säljaren gör, så första trycket efter
 * lunch fick vänta ut en kall skrivning. Se `/api/presence/route.ts`.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leadIds: string[];
  try {
    const body = await req.json();
    leadIds = Array.isArray(body?.leadIds)
      ? body.leadIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Taket sitter i `renewLeases` (200 id:n) — den skyddar SQLites parametergräns
  // och behöver inte upprepas här.
  const res = await renewLeases(leadIds);

  return NextResponse.json(res);
}
