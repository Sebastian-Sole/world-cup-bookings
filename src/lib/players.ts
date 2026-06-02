import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";

/**
 * The shared device-player identity (one name set once, reused for RSVP +
 * predictions). Trust-based: `id` is client-generated. Each player also gets a
 * short, shareable **sync code** so the same person can link the identity on
 * another device (paste the code) and keep their predictions in sync.
 */

// Unambiguous alphabet (no 0/O/1/I/L). 8 chars ≈ 30^8 ≈ 6.5e11 combinations.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++)
    out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Normalize user-entered codes: uppercase, strip spaces/dashes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * Register a new player or rename an existing one. Assigns a sync code on first
 * creation (and backfills it if missing). Returns the player's code.
 */
export async function registerOrRenamePlayer(
  id: string,
  name: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode();
    try {
      await sql`
        INSERT INTO players (id, name, code) VALUES (${id}, ${name}, ${candidate})
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              code = COALESCE(players.code, EXCLUDED.code)
      `;
      break;
    } catch (err) {
      if (isUniqueViolation(err)) continue; // code collided — try another
      throw err;
    }
  }
  const rows = (await sql`
    SELECT code FROM players WHERE id = ${id}
  `) as { code: string | null }[];
  return rows[0]?.code ?? "";
}

export interface Member {
  name: string;
  code: string | null;
}

/**
 * All players with their sync codes — for ADMIN recovery only (read this only
 * behind an isAdmin check; never expose codes to non-admins).
 */
export async function getMembers(): Promise<Member[]> {
  const rows = (await sql`
    SELECT name, code FROM players ORDER BY lower(name)
  `) as { name: string; code: string | null }[];
  return rows.map((r) => ({ name: r.name, code: r.code }));
}

/**
 * Distinct player names (NO codes) for the identity gate's "Is this you?"
 * recognition list. Names are non-sensitive within this private group; codes
 * stay admin-only (see getMembers). Returned case-insensitively sorted.
 */
export async function getPlayerNames(): Promise<string[]> {
  const rows = (await sql`
    SELECT name FROM players ORDER BY lower(name)
  `) as { name: string }[];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    names.push(r.name);
  }
  return names;
}

export interface PlayerIdentity {
  id: string;
  name: string;
  code: string;
}

/** Look up a player by sync code (for linking a new device). */
export async function findPlayerByCode(
  code: string,
): Promise<PlayerIdentity | null> {
  const normalized = normalizeCode(code);
  if (normalized.length !== CODE_LEN) return null;
  const rows = (await sql`
    SELECT id, name, code FROM players WHERE code = ${normalized}
  `) as { id: string; name: string; code: string }[];
  const row = rows[0];
  return row ? { id: row.id, name: row.name, code: row.code } : null;
}
