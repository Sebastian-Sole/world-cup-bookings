import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getInterest } from "@/lib/interest";
import type { InterestResponse } from "@/lib/types";
import { matchIdSchema, rsvpBody } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// GET /api/interest?matchId= — names + count for one match (must reflect new
// RSVPs immediately, so no-store).
export async function GET(request: Request): Promise<Response> {
  const matchId = new URL(request.url).searchParams.get("matchId");

  const parsed = matchIdSchema.safeParse(matchId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid matchId" },
      { status: 400, headers: NO_STORE },
    );
  }

  const interest = await getInterest(parsed.data);
  return NextResponse.json(interest, { headers: NO_STORE });
}

// POST /api/interest — add an RSVP, dedup by (match_id, lower(name)), read back
// the full list in one batched HTTP transaction.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = rsvpBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const { matchId, name } = parsed.data;

  // Insert + read-back atomically in a single non-interactive HTTP round-trip.
  const [inserted, rows] = await sql.transaction([
    sql`INSERT INTO rsvps (match_id, name)
        VALUES (${matchId}, ${name})
        ON CONFLICT (match_id, lower(name)) DO NOTHING
        RETURNING id`,
    sql`SELECT name FROM rsvps WHERE match_id = ${matchId} ORDER BY created_at ASC`,
  ]);

  const deduped = (inserted as unknown[]).length === 0;
  const names = (rows as { name: string }[]).map((r) => r.name);

  const response: InterestResponse = {
    matchId,
    count: names.length,
    names,
    deduped,
  };

  return NextResponse.json(response, { headers: NO_STORE });
}
