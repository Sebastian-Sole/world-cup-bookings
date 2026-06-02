import { sql } from "@/lib/db";
import type { InterestCounts, InterestResponse } from "@/lib/types";

/**
 * Shared server data functions (BUILD_PLAN §3). Imported directly by RSC pages
 * — no HTTP self-fetch. Tagged-template form: `${val}` is a bound parameter.
 */

export async function getCounts(): Promise<InterestCounts> {
  const rows = (await sql`
    SELECT match_id, COUNT(*)::int AS count
    FROM rsvps
    GROUP BY match_id
  `) as { match_id: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.match_id, r.count]));
}

export async function getInterest(matchId: string): Promise<InterestResponse> {
  const rows = (await sql`
    SELECT name FROM rsvps WHERE match_id = ${matchId} ORDER BY created_at ASC
  `) as { name: string }[];
  return { matchId, count: rows.length, names: rows.map((r) => r.name) };
}

/**
 * Remove this device's RSVP for a match (revoke interest), then read back the
 * remaining list in one batched HTTP transaction. Idempotent: deleting a row
 * that isn't there is a no-op and still returns the current list.
 */
export async function removeInterest(
  matchId: string,
  playerId: string,
): Promise<InterestResponse> {
  const [, rows] = await sql.transaction([
    sql`DELETE FROM rsvps WHERE match_id = ${matchId} AND player_id = ${playerId}`,
    sql`SELECT name FROM rsvps WHERE match_id = ${matchId} ORDER BY created_at ASC`,
  ]);
  const names = (rows as { name: string }[]).map((r) => r.name);
  return { matchId, count: names.length, names };
}
