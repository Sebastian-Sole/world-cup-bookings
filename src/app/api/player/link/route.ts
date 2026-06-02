import { NextResponse } from "next/server";
import { findPlayerByCode } from "@/lib/players";
import { linkBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/player/link — body { code }. Resolves a sync code to its player so
 * a new device can adopt the same identity (and see the same predictions/RSVPs).
 * Returns { id, name, code } or 404.
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

  const parsed = linkBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid code" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const player = await findPlayerByCode(parsed.data.code);
    if (!player) {
      return NextResponse.json(
        { error: "No identity found for that code" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(player, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 503, headers: NO_STORE },
    );
  }
}
