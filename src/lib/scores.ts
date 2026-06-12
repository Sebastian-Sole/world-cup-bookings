import { cache } from "react";
import matchesData from "@/data/matches.json";
import { sql } from "@/lib/db";
import type { Match } from "@/lib/types";
import { codeForTeamName } from "@/lib/worldcup-live";

/**
 * Live + final match results, from The Odds API's `/scores` endpoint
 * (the-odds-api.com — the same key/sport we already use for h2h odds). This is
 * our ACTUAL results source: openfootball's worldcup.json carries the fixture
 * skeleton but its volunteers don't post 2026 scores reliably, so standings,
 * prediction scoring and per-match scores all read from here instead.
 *
 * The catch: `/scores` only exposes a rolling ~3-day window (live, upcoming and
 * games completed within the last `daysFrom` days, max 3). A month-long
 * tournament's earlier results fall out of that window — so we PERSIST every
 * completed result to Neon (`match_results`) the first time we see it. The
 * merged view (stored history ∪ the live window) is therefore complete as long
 * as the app is opened at least once every ~3 days during the tournament.
 *
 * Results are oriented to OUR fixtures: score1 = team1, score2 = team2. Never
 * throws — any failure degrades to stored-only (or empty) results.
 */

export interface MatchResult {
  score1: number; // our team1
  score2: number; // our team2
  completed: boolean; // true = final; false = in-progress (live)
}

const SPORT = "soccer_fifa_world_cup";

// `/scores` costs ~2 request credits per call (daysFrom set). The Odds API free
// tier is 500 credits/MONTH and Next's Data Cache is shared across all
// renders/users, so total calls are bounded by this revalidate window, not by
// traffic. 15 min keeps finals/live scores feeling fresh while staying well
// within quota for a small private group; lengthen it to spend even less.
const SCORES_REVALIDATE_SECONDS = 15 * 60;

/** Sorted ISO3 code pair, e.g. ("BRA","ARG") -> "ARG|BRA". */
function pairKey(codeA: string, codeB: string): string {
  return [codeA, codeB].sort().join("|");
}

// Resolved-team code pair -> { matchId, team1Code } so we can align a scores
// event's home/away team to our team1/team2 orientation (mirrors odds.ts).
const PAIR_INDEX: Map<string, { matchId: string; team1Code: string }> = (() => {
  const map = new Map<string, { matchId: string; team1Code: string }>();
  for (const m of matchesData as Match[]) {
    if (!m.team1.resolved || !m.team2.resolved) continue;
    map.set(pairKey(m.team1.code, m.team2.code), {
      matchId: m.id,
      team1Code: m.team1.code,
    });
  }
  return map;
})();

// Our matchId -> resolved code pair, for re-keying results by pair (overlay).
const CODES_BY_MATCH: Map<string, { team1Code: string; team2Code: string }> =
  (() => {
    const map = new Map<string, { team1Code: string; team2Code: string }>();
    for (const m of matchesData as Match[]) {
      if (!m.team1.resolved || !m.team2.resolved) continue;
      map.set(m.id, { team1Code: m.team1.code, team2Code: m.team2.code });
    }
    return map;
  })();

// ---- The Odds API /scores shape -------------------------------------------

interface ScoreEvent {
  completed?: boolean;
  home_team?: string;
  away_team?: string;
  scores?: { name?: string; score?: string }[] | null;
}

/** Numeric score for a named side within a scores event, or null. */
function scoreOf(
  scores: { name?: string; score?: string }[],
  teamName: string | undefined,
): number | null {
  const s = scores.find((x) => x.name === teamName);
  if (!s || s.score == null) return null;
  const n = Number(s.score);
  return Number.isFinite(n) ? n : null;
}

/** Map scores events to `matchId -> MatchResult`, oriented to our fixtures. */
function indexLive(events: ScoreEvent[]): Map<string, MatchResult> {
  const out = new Map<string, MatchResult>();
  for (const ev of events) {
    if (!ev.scores || ev.scores.length === 0) continue; // upcoming, no score yet
    const homeCode = codeForTeamName(ev.home_team ?? "");
    const awayCode = codeForTeamName(ev.away_team ?? "");
    if (!homeCode || !awayCode) continue;
    const hit = PAIR_INDEX.get(pairKey(homeCode, awayCode));
    if (!hit) continue;
    const homeScore = scoreOf(ev.scores, ev.home_team);
    const awayScore = scoreOf(ev.scores, ev.away_team);
    if (homeScore == null || awayScore == null) continue;
    const eventHomeIsOurTeam1 = homeCode === hit.team1Code;
    out.set(hit.matchId, {
      score1: eventHomeIsOurTeam1 ? homeScore : awayScore,
      score2: eventHomeIsOurTeam1 ? awayScore : homeScore,
      completed: ev.completed === true,
    });
  }
  return out;
}

/** Fetch the live scores window. {} on no key/quota or any error. */
async function fetchLiveResults(): Promise<Map<string, MatchResult>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return new Map();
  try {
    const url = new URL(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/scores/`,
    );
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("daysFrom", "3");
    const res = await fetch(url, {
      next: { revalidate: SCORES_REVALIDATE_SECONDS },
    });
    if (!res.ok) return new Map();
    const events = (await res.json()) as ScoreEvent[];
    if (!Array.isArray(events)) return new Map();
    return indexLive(events);
  } catch {
    return new Map();
  }
}

/** Read persisted results. Empty map if no DB or on any error. */
async function readStoredResults(): Promise<Map<string, MatchResult>> {
  try {
    const rows = (await sql`
      SELECT match_id, score1, score2, completed FROM match_results
    `) as {
      match_id: string;
      score1: number | string;
      score2: number | string;
      completed: boolean;
    }[];
    return new Map(
      rows.map((r) => [
        r.match_id,
        {
          score1: Number(r.score1),
          score2: Number(r.score2),
          completed: r.completed,
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

/** Upsert completed results. Best-effort: swallows errors (e.g. no DB). */
async function persistResults(entries: [string, MatchResult][]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await sql.transaction(
      entries.map(
        ([id, r]) => sql`
          INSERT INTO match_results (match_id, score1, score2, completed)
          VALUES (${id}, ${r.score1}, ${r.score2}, ${true})
          ON CONFLICT (match_id) DO UPDATE
            SET score1 = EXCLUDED.score1,
                score2 = EXCLUDED.score2,
                completed = EXCLUDED.completed,
                updated_at = now()
        `,
      ),
    );
  } catch {
    // No DATABASE_URL or write failed — results still render from the live
    // window this request; we'll persist again next time it's seen.
  }
}

/**
 * Merged results keyed by our match id: persisted history overlaid with the
 * live window (which is fresher and also carries in-progress games). Any
 * newly-final result seen in the live window is persisted. React-cached so the
 * read+persist runs once per request even with multiple callers.
 */
export const getResults = cache(async (): Promise<Map<string, MatchResult>> => {
  const [stored, live] = await Promise.all([
    readStoredResults(),
    fetchLiveResults(),
  ]);
  const merged = new Map(stored);
  const toPersist: [string, MatchResult][] = [];
  for (const [id, r] of live) {
    merged.set(id, r);
    if (!r.completed) continue;
    const prev = stored.get(id);
    if (
      !prev ||
      !prev.completed ||
      prev.score1 !== r.score1 ||
      prev.score2 !== r.score2
    ) {
      toPersist.push([id, r]);
    }
  }
  await persistResults(toPersist);
  return merged;
});

/** A result re-keyed by sorted code pair, carrying our fixture orientation. */
export interface PairResult extends MatchResult {
  team1Code: string;
  team2Code: string;
}

/**
 * Merged results keyed by sorted code pair, for overlaying onto sources that
 * lack our match id (e.g. openfootball's LiveMatch in worldcup-live).
 */
export async function getResultsByPair(): Promise<Map<string, PairResult>> {
  const results = await getResults();
  const out = new Map<string, PairResult>();
  for (const [matchId, r] of results) {
    const codes = CODES_BY_MATCH.get(matchId);
    if (!codes) continue;
    out.set(pairKey(codes.team1Code, codes.team2Code), { ...r, ...codes });
  }
  return out;
}

export { pairKey };
