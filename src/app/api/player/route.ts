import { NextResponse } from "next/server";
import { registerOrRenamePlayer } from "@/lib/players";
import { playerBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/player — register or rename this device's player. Called when the
 * name gate is completed or the name is edited. Idempotent.
 */
export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = playerBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const code = await registerOrRenamePlayer(
      parsed.data.playerId,
      parsed.data.name,
    );
    return NextResponse.json({ ok: true, code }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Could not save" },
      { status: 503, headers: NO_STORE },
    );
  }
}
