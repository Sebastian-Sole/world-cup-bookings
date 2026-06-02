import matchesData from "@/data/matches.json";
import type { Match } from "@/lib/types";
import { codeForTeamName } from "@/lib/worldcup-live";

/**
 * Head-to-head (home/draw/away) decimal odds per match, from The Odds API
 * (the-odds-api.com — free tier 500 req/month, decimal odds, World Cup h2h).
 *
 * One request returns every upcoming match, so we cache it for an hour. Odds
 * are oriented to OUR fixture: `home` = team1 wins, `away` = team2 wins. Used
 * to weight prediction points; absent odds (no key/quota, or a match not yet
 * priced) simply fall back to flat 1-point scoring. Never throws.
 */

export interface MatchOdds {
  home: number | null;
  draw: number | null;
  away: number | null;
}

const SPORT = "soccer_fifa_world_cup";

// The Odds API free tier is 500 requests/MONTH. This single endpoint returns
// every match's odds in one call, and Next's Data Cache is shared across all
// renders/routes/users — so total external calls are bounded purely by this
// revalidate window, not by traffic or match count. 6h → ~120 calls/month,
// well under the cap (odds are snapshotted at prediction time anyway, so they
// don't need to be minute-fresh). Lengthen further to spend even less.
const ODDS_REVALIDATE_SECONDS = 6 * 60 * 60;

// Resolved-team code pair ("ARG|BRA", sorted) -> { matchId, team1Code } so we
// can align a bookmaker event's home/away to our team1/team2 orientation.
const PAIR_INDEX: Map<string, { matchId: string; team1Code: string }> = (() => {
  const map = new Map<string, { matchId: string; team1Code: string }>();
  for (const m of matchesData as Match[]) {
    if (!m.team1.resolved || !m.team2.resolved) continue;
    const key = [m.team1.code, m.team2.code].sort().join("|");
    map.set(key, { matchId: m.id, team1Code: m.team1.code });
  }
  return map;
})();

interface OddsEvent {
  home_team?: string;
  away_team?: string;
  bookmakers?: {
    markets?: {
      key?: string;
      outcomes?: { name?: string; price?: number }[];
    }[];
  }[];
}

/** Mean of an array, or null if empty. */
function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Map The Odds API events to `matchId -> MatchOdds`, oriented to our fixtures.
 * Averages each outcome's decimal price across all bookmakers offering h2h.
 */
function indexEvents(events: OddsEvent[]): Record<string, MatchOdds> {
  const out: Record<string, MatchOdds> = {};
  for (const ev of events) {
    const homeCode = codeForTeamName(ev.home_team ?? "");
    const awayCode = codeForTeamName(ev.away_team ?? "");
    if (!homeCode || !awayCode) continue;
    const hit = PAIR_INDEX.get([homeCode, awayCode].sort().join("|"));
    if (!hit) continue;

    const homePrices: number[] = [];
    const drawPrices: number[] = [];
    const awayPrices: number[] = [];
    for (const bm of ev.bookmakers ?? []) {
      const h2h = bm.markets?.find((mk) => mk.key === "h2h");
      if (!h2h?.outcomes) continue;
      for (const o of h2h.outcomes) {
        if (o.price == null || !o.name) continue;
        if (o.name === ev.home_team) homePrices.push(o.price);
        else if (o.name === ev.away_team) awayPrices.push(o.price);
        else drawPrices.push(o.price); // "Draw"
      }
    }

    const evHome = mean(homePrices);
    const evAway = mean(awayPrices);
    const draw = mean(drawPrices);
    // Orient to our team1/team2: if the event's home team is our team1, keep;
    // otherwise the event home corresponds to our team2 (away).
    const eventHomeIsOurTeam1 = homeCode === hit.team1Code;
    out[hit.matchId] = {
      home: eventHomeIsOurTeam1 ? evHome : evAway,
      away: eventHomeIsOurTeam1 ? evAway : evHome,
      draw,
    };
  }
  return out;
}

/** Fetch + map current World Cup h2h odds. {} if no key/quota or on any error. */
export async function getOddsByMatchId(): Promise<Record<string, MatchOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return {}; // flat-points mode

  try {
    const url = new URL(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/`,
    );
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", "eu");
    url.searchParams.set("markets", "h2h");
    url.searchParams.set("oddsFormat", "decimal");

    const res = await fetch(url, {
      next: { revalidate: ODDS_REVALIDATE_SECONDS },
    });
    if (!res.ok) return {};
    const events = (await res.json()) as OddsEvent[];
    if (!Array.isArray(events)) return {};
    return indexEvents(events);
  } catch {
    return {};
  }
}

/** Odds for a single match's picked outcome (the points it would award). */
export function oddsForPick(
  odds: MatchOdds | undefined,
  pick: "home" | "draw" | "away",
): number | null {
  if (!odds) return null;
  return odds[pick];
}
