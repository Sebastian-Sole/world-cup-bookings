import { NextResponse } from "next/server";
import { getPlayerPredictions, upsertPrediction } from "@/lib/predictions";
import { playerIdSchema, predictionBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** GET /api/predictions?playerId= — that device's picks (to prefill the UI). */
export async function GET(request: Request): Promise<Response> {
  const playerId = new URL(request.url).searchParams.get("playerId");
  const parsed = playerIdSchema.safeParse(playerId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid playerId" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const predictions = await getPlayerPredictions(parsed.data);
    return NextResponse.json({ predictions }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ predictions: [] }, { headers: NO_STORE });
  }
}

/**
 * POST /api/predictions — body { playerId, name, matchId, pick }. Upserts the
 * player + pick. Rejected (409) once the match has kicked off; odds for the
 * picked outcome are snapshotted server-side.
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

  const parsed = predictionBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await upsertPrediction(parsed.data);
  if (result.ok) {
    return NextResponse.json(
      { ok: true, pick: result.pick, odds: result.odds },
      { headers: NO_STORE },
    );
  }
  const status =
    result.error === "locked"
      ? 409
      : result.error === "unknown_match"
        ? 404
        : 503;
  return NextResponse.json(
    { ok: false, error: result.error },
    { status, headers: NO_STORE },
  );
}
