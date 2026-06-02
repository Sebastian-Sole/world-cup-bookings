import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { getHostState, setHostStatus } from "@/lib/host";
import { hostStatusBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** GET /api/host-status — public { status, comments } maps (for client refresh). */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await getHostState(), { headers: NO_STORE });
  } catch {
    // No DB yet / unreachable — degrade to empty so the UI still renders.
    return NextResponse.json(
      { status: {}, comments: {} },
      { headers: NO_STORE },
    );
  }
}

/** POST /api/host-status — admin only. Body { matchId, status }. Upserts. */
export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminRequest())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = hostStatusBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await setHostStatus(parsed.data.matchId, parsed.data.status);
  } catch {
    return NextResponse.json(
      { error: "Could not save (database unavailable)" },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
