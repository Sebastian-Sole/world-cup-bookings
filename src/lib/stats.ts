import { sql } from "@/lib/db";

/**
 * Server-side reads/writes for the Stats page's "Us" counters (Neon). Mirrors
 * the host.ts pattern: RSC pages and route handlers call these directly. Reads
 * can throw if the DB is missing/unreachable — CALLERS guard with try/catch and
 * fall back to []. Writes are admin-gated in the route handler.
 *
 * "Us" stats are the group's own counters (beers, attendance, …) — there is no
 * API for those, so they're admin-edited. World Cup + Player stats come from
 * the live openfootball feed (`src/lib/worldcup-live.ts`), NOT from here.
 */

export interface UsStat {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  sortOrder: number;
}

/** All "Us" counters, ordered for display. */
export async function getUsStats(): Promise<UsStat[]> {
  const rows = (await sql`
    SELECT key, label, value, unit, sort_order
    FROM us_stats
    ORDER BY sort_order, key
  `) as {
    key: string;
    label: string;
    value: number | string;
    unit: string | null;
    sort_order: number;
  }[];

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    // BIGINT comes back as a string from the Neon driver — coerce to number.
    value: Number(r.value),
    unit: r.unit,
    sortOrder: r.sort_order,
  }));
}

/** Set a single "Us" counter's value. */
export async function setUsStat(key: string, value: number): Promise<void> {
  await sql`
    UPDATE us_stats
    SET value = ${value}, updated_at = now()
    WHERE key = ${key}
  `;
}
