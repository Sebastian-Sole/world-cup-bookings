import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { setHostComment } from "@/lib/host";
import { hostCommentBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** POST /api/host-comment — admin only. Body { matchId, comment }. Upserts. */
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

  const parsed = hostCommentBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await setHostComment(parsed.data.matchId, parsed.data.comment);
  } catch {
    return NextResponse.json(
      { error: "Could not save (database unavailable)" },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
