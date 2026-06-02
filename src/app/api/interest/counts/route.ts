import { NextResponse } from "next/server";
import { getCounts } from "@/lib/interest";

export const runtime = "nodejs";

// GET /api/interest/counts — matchId -> count map. Used only by the client
// polling hook; the RSC home reads getCounts() directly. no-store so polling
// always sees fresh truth.
export async function GET(): Promise<Response> {
  const counts = await getCounts();
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "no-store" },
  });
}
