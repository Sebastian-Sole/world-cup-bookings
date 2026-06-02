import { sql } from "@/lib/db";
import { getAllMatches, getMatchById } from "@/lib/matches";
import { getOddsByMatchId, oddsForPick } from "@/lib/odds";
import type { Match } from "@/lib/types";
import { getWorldCupData, type LiveMatch } from "@/lib/worldcup-live";

/**
 * Predictions + leaderboard. Trust-based (no accounts): a player is a device
 * with a client-generated id + a chosen name. Integrity rules that matter are
 * enforced SERVER-SIDE: a pick can't be set/changed after kickoff, and points
 * are computed from real results (openfootball) — never trusted from the client.
 *
 * Scoring: a correct winner pick earns the decimal odds snapshotted at pick
 * time (1.05–4.92…); if no odds were available, it earns 1 flat point.
 */

export type Pick = "home" | "draw" | "away";

export interface PlayerPrediction {
  matchId: string;
  pick: Pick;
  odds: number | null;
}

export interface LeaderboardRow {
  playerId: string;
  name: string;
  points: number;
  correct: number;
  incorrect: number;
  settled: number; // predictions on matches that have finished
  pending: number; // predictions on matches not yet played
  accuracy: number; // 0–1 over settled
  streak: number; // current trailing run of correct settled picks (chrono order)
  avgOdds: number | null; // mean odds of priced picks (higher = riskier)
  card: PlayerCard; // per-player risk/profit detail for the row's modal
}

/** One of a player's picks, enriched for their detail card. */
export interface PredictionDetail {
  matchId: string;
  match: string; // "Norway v Brazil"
  kickoffUtc: string;
  pickLabel: string; // picked team's name, or "Draw"
  odds: number | null;
  status: "pending" | "correct" | "wrong";
  profit: number | null; // settled only: net NOK on a flat 100 NOK stake
}

/** Per-player risk/profit breakdown shown when a leaderboard row is opened. */
export interface PlayerCard {
  avgOdds: number | null; // mean snapshotted odds across priced picks (risk)
  hasOdds: boolean; // false in flat-points mode → hide the money figures
  biggestWin: { odds: number; match: string; pickLabel: string } | null;
  staked: number; // 100 NOK × settled picks
  profit: number; // net NOK if they'd staked 100 on every settled pick
  predictions: PredictionDetail[]; // chronological (kickoff asc)
}

export interface UpsertResult {
  ok: boolean;
  error?: "locked" | "unknown_match" | "db";
  pick?: Pick;
  odds?: number | null;
}

/** True once a match has kicked off (picks lock at kickoff). */
function hasKickedOff(match: Match): boolean {
  return Date.now() >= new Date(match.kickoffUtc).getTime();
}

/** All of a player's picks (for showing their current selection per match). */
export async function getPlayerPredictions(
  playerId: string,
): Promise<PlayerPrediction[]> {
  const rows = (await sql`
    SELECT match_id, pick, odds FROM predictions WHERE player_id = ${playerId}
  `) as { match_id: string; pick: Pick; odds: number | string | null }[];
  return rows.map((r) => ({
    matchId: r.match_id,
    pick: r.pick,
    odds: r.odds == null ? null : Number(r.odds),
  }));
}

/**
 * Create/update a pick. Upserts the player (id+name), rejects if the match is
 * unknown or already kicked off, and snapshots the picked outcome's odds.
 */
export async function upsertPrediction(params: {
  playerId: string;
  name: string;
  matchId: string;
  pick: Pick;
}): Promise<UpsertResult> {
  const match = getMatchById(params.matchId);
  if (!match) return { ok: false, error: "unknown_match" };
  if (hasKickedOff(match)) return { ok: false, error: "locked" };

  let odds: number | null = null;
  try {
    const all = await getOddsByMatchId();
    odds = oddsForPick(all[params.matchId], params.pick);
  } catch {
    odds = null; // flat fallback
  }

  try {
    await sql.transaction([
      sql`
        INSERT INTO players (id, name) VALUES (${params.playerId}, ${params.name})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `,
      sql`
        INSERT INTO predictions (player_id, match_id, pick, odds)
        VALUES (${params.playerId}, ${params.matchId}, ${params.pick}, ${odds})
        ON CONFLICT (player_id, match_id)
          DO UPDATE SET pick = EXCLUDED.pick, odds = EXCLUDED.odds, updated_at = now()
      `,
    ]);
  } catch {
    return { ok: false, error: "db" };
  }
  return { ok: true, pick: params.pick, odds };
}

/** Outcome of a played LiveMatch relative to a given "our team1" code. */
function outcomeFor(live: LiveMatch, ourTeam1Code: string): Pick | null {
  if (!live.played || live.score1 === null || live.score2 === null) return null;
  const team1Wins = live.score1 > live.score2;
  const draw = live.score1 === live.score2;
  if (draw) return "draw";
  // Align to our orientation: is the live match's team1 our team1?
  const liveTeam1IsOurs = live.team1Code === ourTeam1Code;
  if (liveTeam1IsOurs) return team1Wins ? "home" : "away";
  return team1Wins ? "away" : "home";
}

/** Display name of a picked outcome, oriented to our fixture. */
function pickLabel(m: Match, pick: Pick): string {
  if (pick === "draw") return "Draw";
  return pick === "home" ? m.team1.display : m.team2.display;
}

/** Map our matchId -> settled outcome, from live results (group + knockout). */
function buildOutcomeMap(
  matches: Match[],
  live: LiveMatch[],
): Map<string, Pick> {
  // Index played live matches by sorted resolved code pair.
  const byPair = new Map<string, LiveMatch>();
  for (const lm of live) {
    if (!lm.played || !lm.team1Code || !lm.team2Code) continue;
    byPair.set([lm.team1Code, lm.team2Code].sort().join("|"), lm);
  }
  const out = new Map<string, Pick>();
  for (const m of matches) {
    if (!m.team1.resolved || !m.team2.resolved) continue;
    const lm = byPair.get([m.team1.code, m.team2.code].sort().join("|"));
    if (!lm) continue;
    const o = outcomeFor(lm, m.team1.code);
    if (o) out.set(m.id, o);
  }
  return out;
}

interface RawPredictionRow {
  player_id: string;
  name: string;
  match_id: string;
  pick: Pick;
  odds: number | string | null;
}

/**
 * Compute the leaderboard on read: join all predictions with live results,
 * award odds-weighted (or flat) points for correct settled picks, and derive
 * each player's current correct streak in chronological match order.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = (await sql`
    SELECT p.player_id, pl.name, p.match_id, p.pick, p.odds
    FROM predictions p
    JOIN players pl ON pl.id = p.player_id
  `) as RawPredictionRow[];
  if (rows.length === 0) return [];

  const matches = getAllMatches();
  const kickoff = new Map(matches.map((m) => [m.id, m.kickoffUtc]));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const wc = await getWorldCupData();
  const outcomes = buildOutcomeMap(matches, wc.matches);

  interface Acc {
    name: string;
    points: number;
    correct: number;
    incorrect: number;
    pending: number;
    oddsValues: number[]; // priced picks, for the average-odds risk metric
    picks: PredictionDetail[]; // every pick, enriched (for the detail card)
  }
  const players = new Map<string, Acc>();

  for (const r of rows) {
    const acc =
      players.get(r.player_id) ??
      ({
        name: r.name,
        points: 0,
        correct: 0,
        incorrect: 0,
        pending: 0,
        oddsValues: [],
        picks: [],
      } satisfies Acc);
    players.set(r.player_id, acc);
    acc.name = r.name;

    const m = matchById.get(r.match_id);
    const odds = r.odds == null ? null : Number(r.odds);
    if (odds != null) acc.oddsValues.push(odds);
    const ko = kickoff.get(r.match_id) ?? "";
    const label = m ? `${m.team1.display} v ${m.team2.display}` : r.match_id;
    const pLabel = m ? pickLabel(m, r.pick) : r.pick;

    const outcome = outcomes.get(r.match_id);
    if (!outcome) {
      acc.pending++;
      acc.picks.push({
        matchId: r.match_id,
        match: label,
        kickoffUtc: ko,
        pickLabel: pLabel,
        odds,
        status: "pending",
        profit: null,
      });
      continue;
    }
    const correct = r.pick === outcome;
    // Flat 100 NOK stake: a correct pick returns 100 × odds (1 if unpriced).
    const profit = correct ? 100 * (odds ?? 1) - 100 : -100;
    acc.picks.push({
      matchId: r.match_id,
      match: label,
      kickoffUtc: ko,
      pickLabel: pLabel,
      odds,
      status: correct ? "correct" : "wrong",
      profit,
    });
    if (correct) {
      acc.correct++;
      acc.points += odds ?? 1;
    } else {
      acc.incorrect++;
    }
  }

  const board: LeaderboardRow[] = [];
  for (const [playerId, acc] of players) {
    const settled = acc.correct + acc.incorrect;
    const predictions = [...acc.picks].sort((a, b) =>
      a.kickoffUtc.localeCompare(b.kickoffUtc),
    );
    // Current streak: trailing run of correct picks in chronological order.
    let streak = 0;
    for (let i = predictions.length - 1; i >= 0; i--) {
      const p = predictions[i];
      if (p.status === "pending") continue;
      if (p.status === "correct") streak++;
      else break;
    }
    const avgOdds = acc.oddsValues.length
      ? Math.round(
          (acc.oddsValues.reduce((s, v) => s + v, 0) / acc.oddsValues.length) *
            100,
        ) / 100
      : null;
    const biggestWin = predictions.reduce<PredictionDetail | null>(
      (best, p) =>
        p.status === "correct" &&
        p.odds != null &&
        (best == null || p.odds > (best.odds ?? 0))
          ? p
          : best,
      null,
    );
    const settledPicks = predictions.filter((p) => p.status !== "pending");
    const profit = Math.round(
      settledPicks.reduce((s, p) => s + (p.profit ?? 0), 0),
    );
    const card: PlayerCard = {
      avgOdds,
      hasOdds: acc.oddsValues.length > 0,
      biggestWin:
        biggestWin && biggestWin.odds != null
          ? {
              odds: biggestWin.odds,
              match: biggestWin.match,
              pickLabel: biggestWin.pickLabel,
            }
          : null,
      staked: settledPicks.length * 100,
      profit,
      predictions,
    };
    board.push({
      playerId,
      name: acc.name,
      points: Math.round(acc.points * 100) / 100,
      correct: acc.correct,
      incorrect: acc.incorrect,
      settled,
      pending: acc.pending,
      accuracy: settled ? acc.correct / settled : 0,
      streak,
      avgOdds,
      card,
    });
  }
  return board.sort(
    (a, b) =>
      b.points - a.points ||
      b.correct - a.correct ||
      a.name.localeCompare(b.name),
  );
}
