import { NextResponse } from "next/server";
import { getMatchById } from "@/lib/matches";
import { matchIdSchema } from "@/lib/validation";
import { resolveWeather } from "@/lib/weather";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

export async function GET(request: Request): Promise<Response> {
  const matchId = new URL(request.url).searchParams.get("matchId");

  const parsed = matchIdSchema.safeParse(matchId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  }

  const match = getMatchById(parsed.data);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const weather = await resolveWeather(match);
  return NextResponse.json(weather, { headers: CACHE_HEADERS });
}
