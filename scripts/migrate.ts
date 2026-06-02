/**
 * Idempotent DB migration (BUILD_PLAN.md §2.1).
 *   pnpm tsx scripts/migrate.ts
 *
 * Reads DATABASE_URL from the environment. Unlike the Next.js app, a standalone
 * `tsx` script does NOT auto-load .env.local, so we load it explicitly here
 * (Node 20.6+ `process.loadEnvFile`). If still unset, prints a message and
 * exits 0 (never crashes) so it is safe to invoke in environments without a DB.
 */
import { neon } from "@neondatabase/serverless";

// Load .env.local (then .env) so `pnpm tsx scripts/migrate.ts` just works.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing — fine; fall back to the ambient environment
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "DATABASE_URL is not set — skipping migration. " +
        "Set it (e.g. `vercel env pull .env.local`) and re-run.",
    );
    process.exit(0);
  }

  const sql = neon(url);

  console.log("Creating table rsvps (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      match_id    TEXT        NOT NULL,
      name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Creating index rsvps_match_id_idx (if not exists)…");
  await sql`
    CREATE INDEX IF NOT EXISTS rsvps_match_id_idx ON rsvps (match_id)
  `;

  console.log("Creating unique index rsvps_match_name_uniq (if not exists)…");
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS rsvps_match_name_uniq
      ON rsvps (match_id, lower(name))
  `;

  console.log("Creating table host_status (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS host_status (
      match_id    TEXT        PRIMARY KEY,
      status      TEXT        NOT NULL CHECK (status IN ('available','limited','blocked')),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Adding host_status.comment column (if not exists)…");
  await sql`ALTER TABLE host_status ADD COLUMN IF NOT EXISTS comment TEXT`;

  console.log("Creating table us_stats (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS us_stats (
      key         TEXT        PRIMARY KEY,
      label       TEXT        NOT NULL,
      value       BIGINT      NOT NULL DEFAULT 0,
      unit        TEXT,
      sort_order  INT         NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Seeding default us_stats rows (if not present)…");
  await sql`
    INSERT INTO us_stats (key, label, value, unit, sort_order) VALUES
      ('beers',         'Beers drunk',      0, NULL,       1),
      ('attendance',    'Total attendance', 0, NULL,       2),
      ('games_watched', 'Games watched',    0, NULL,       3),
      ('grill_food',    'Grill food eaten', 0, 'servings', 4)
    ON CONFLICT (key) DO NOTHING
  `;

  // Player stats are now sourced live from openfootball (see
  // src/lib/worldcup-live.ts), so the old admin-entered player_stats table is
  // dropped. (No-op if it was never created.)
  console.log("Dropping unused table player_stats (if exists)…");
  await sql`DROP TABLE IF EXISTS player_stats`;

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
