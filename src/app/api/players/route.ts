import { NextResponse } from "next/server";
import { getPlayerNames } from "@/lib/players";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/players — distinct member names (NO codes) for the identity gate's
 * "Is this you?" recognition list. Names only; safe to expose within this
 * private group. Falls back to an empty list if the DB is unreachable so the
 * gate still works (create-new / enter-code paths).
 */
export async function GET(): Promise<Response> {
  try {
    const names = await getPlayerNames();
    return NextResponse.json({ names }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ names: [] }, { headers: NO_STORE });
  }
}
