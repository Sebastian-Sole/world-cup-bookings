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

  // RSVPs are now tied to a device-player (one RSVP per person per match), so
  // dedup is by (match_id, player_id) rather than name. Legacy rows keep a null
  // player_id (Postgres treats nulls as distinct, so they don't collide).
  console.log("Adding rsvps.player_id column (if not exists)…");
  await sql`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS player_id TEXT`;

  console.log("Replacing rsvps dedup index with (match_id, player_id)…");
  await sql`DROP INDEX IF EXISTS rsvps_match_name_uniq`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS rsvps_match_player_uniq
      ON rsvps (match_id, player_id)
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

  console.log("Creating table players (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id          TEXT        PRIMARY KEY,
      name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // A short, shareable sync code lets one person link the same identity across
  // devices (paste it on a new device). Partial unique index allows nulls
  // during backfill (codes are assigned on first /api/player call).
  console.log("Adding players.code column + unique index (if not exists)…");
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS code TEXT`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS players_code_uniq
      ON players (code) WHERE code IS NOT NULL
  `;

  console.log("Creating table predictions (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS predictions (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      player_id   TEXT        NOT NULL REFERENCES players (id) ON DELETE CASCADE,
      match_id    TEXT        NOT NULL,
      pick        TEXT        NOT NULL CHECK (pick IN ('home','draw','away')),
      odds        NUMERIC,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (player_id, match_id)
    )
  `;

  console.log("Creating index predictions_match_id_idx (if not exists)…");
  await sql`
    CREATE INDEX IF NOT EXISTS predictions_match_id_idx ON predictions (match_id)
  `;

  // Final/live results, persisted from The Odds API's rolling 3-day /scores
  // window (see src/lib/scores.ts). That window only exposes the last ~3 days of
  // completed games, so we persist each result the first time we see it; this
  // table is then the permanent source of truth for standings + prediction
  // scoring across the whole month-long tournament. Keyed by OUR match id, with
  // scores oriented to our fixture (score1 = team1, score2 = team2).
  console.log("Creating table match_results (if not exists)…");
  await sql`
    CREATE TABLE IF NOT EXISTS match_results (
      match_id    TEXT        PRIMARY KEY,
      score1      INT         NOT NULL,
      score2      INT         NOT NULL,
      completed   BOOLEAN     NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
