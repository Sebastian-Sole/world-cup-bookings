import { sql } from "@/lib/db";
import type { HostStatus } from "@/lib/host-status";

/**
 * Server-side reads/writes of hosting status + admin comments (Neon). Mirrors
 * the interest pattern: RSC pages call these directly; the client updates
 * optimistically after admin writes. Reads tolerate a missing/unreachable DB by
 * returning empties (handled by callers' try/catch); writes are admin-gated in
 * the routes.
 */

export interface HostState {
  status: Record<string, HostStatus>;
  comments: Record<string, string>;
}

export async function getHostState(): Promise<HostState> {
  const rows = (await sql`
    SELECT match_id, status, comment FROM host_status
  `) as { match_id: string; status: HostStatus; comment: string | null }[];

  const status: Record<string, HostStatus> = {};
  const comments: Record<string, string> = {};
  for (const r of rows) {
    status[r.match_id] = r.status;
    if (r.comment) comments[r.match_id] = r.comment;
  }
  return { status, comments };
}

/** Upsert a match's status, preserving any existing comment. */
export async function setHostStatus(
  matchId: string,
  status: HostStatus,
): Promise<void> {
  await sql`
    INSERT INTO host_status (match_id, status, updated_at)
    VALUES (${matchId}, ${status}, now())
    ON CONFLICT (match_id)
      DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  `;
}

/**
 * Upsert a match's comment, preserving any existing status (defaulting a new
 * row to "available"). An empty string clears the comment.
 */
export async function setHostComment(
  matchId: string,
  comment: string,
): Promise<void> {
  const value = comment.trim() === "" ? null : comment.trim();
  await sql`
    INSERT INTO host_status (match_id, status, comment, updated_at)
    VALUES (${matchId}, 'available', ${value}, now())
    ON CONFLICT (match_id)
      DO UPDATE SET comment = ${value}, updated_at = now()
  `;
}
