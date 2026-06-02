import { z } from "zod";

/**
 * Shared zod validation schemas.
 *
 * Phase 2 only needs `matchIdSchema` (used by GET /api/weather). The RSVP
 * schemas (`nameSchema`, `rsvpBody`) are intentionally NOT defined here — they
 * land in Phase 3 (persistence/interest) per BUILD_PLAN §3. A future Phase 3
 * agent should ADD them to this file alongside `matchIdSchema` rather than
 * redefining it, to avoid collisions.
 */
export const matchIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

/**
 * RSVP attendee name (BUILD_PLAN §3). Trim, collapse internal whitespace, then
 * enforce length (1–40, matching the DB CHECK constraint) and an allowed
 * character set: letters/marks/numbers plus space, period, apostrophe, hyphen.
 */
export const nameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1)
      .max(40)
      .regex(/^[\p{L}\p{M}\p{N} .'-]+$/u),
  );

/** A device player id (client-generated, e.g. crypto.randomUUID()). */
export const playerIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const rsvpBody = z.object({
  matchId: matchIdSchema,
  name: nameSchema,
  playerId: playerIdSchema,
});

/** Revoke an RSVP (DELETE /api/interest) — keyed by match + device. */
export const revokeBody = z.object({
  matchId: matchIdSchema,
  playerId: playerIdSchema,
});

/** Register/rename a device player (POST /api/player). */
export const playerBody = z.object({
  playerId: playerIdSchema,
  name: nameSchema,
});

/** Link an existing identity on a new device via its sync code. */
export const linkBody = z.object({
  code: z.string().min(4).max(20),
});

/** Admin-set hosting status for a match. */
export const hostStatusBody = z.object({
  matchId: matchIdSchema,
  status: z.enum(["available", "limited", "blocked"]),
});

/** Admin-set free-text comment for a match (empty string clears it). */
export const hostCommentBody = z.object({
  matchId: matchIdSchema,
  comment: z.string().max(280),
});

/** Admin-set value for a single "Us" counter (POST /api/us-stats). */
export const usStatBody = z.object({
  key: z.string().min(1).max(40),
  value: z.number().int().min(0).max(1_000_000),
});

/** A match-winner prediction (POST /api/predictions). */
export const predictionBody = z.object({
  playerId: playerIdSchema,
  name: nameSchema,
  matchId: matchIdSchema,
  pick: z.enum(["home", "draw", "away"]),
});
