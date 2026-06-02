import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { setUsStat } from "@/lib/stats";
import { usStatBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** POST /api/us-stats — admin only. Body { key, value }. Sets one counter. */
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

  const parsed = usStatBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await setUsStat(parsed.data.key, parsed.data.value);
  } catch {
    return NextResponse.json(
      { error: "Could not save (database unavailable)" },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
