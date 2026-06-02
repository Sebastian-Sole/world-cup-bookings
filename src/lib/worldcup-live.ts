import matchesData from "@/data/matches.json";
import type { Match } from "@/lib/types";

/**
 * Live World Cup data derived from openfootball's public-domain worldcup.json
 * (the same keyless source our fixtures come from). It carries final scores and
 * individual goal scorers once matches are played, so we can compute standings,
 * a top-scorer leaderboard, and resolved knockout fixtures — all free, no API
 * key, no rate limit. Everything is empty/zero until the tournament starts.
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// ---- Types (the contract consumed by the World Cup + Player tabs) ----------

export interface LiveMatch {
  round: string;
  group: string | null; // "A".."L" for group stage, null for knockout
  date: string; // YYYY-MM-DD
  ground: string;
  team1Name: string;
  team2Name: string;
  team1Code: string | null;
  team2Code: string | null;
  played: boolean;
  score1: number | null;
  score2: number | null;
}

export interface GroupRow {
  name: string;
  code: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface TopScorer {
  player: string;
  teamName: string;
  teamCode: string | null;
  goals: number;
  penalties: number;
}

export interface WorldCupData {
  groupStandings: { group: string; rows: GroupRow[] }[];
  groupMatches: { group: string; matches: LiveMatch[] }[];
  knockoutByRound: { round: string; matches: LiveMatch[] }[];
  topScorers: TopScorer[];
  /** Flat list of every match (group + knockout), for result lookup/scoring. */
  matches: LiveMatch[];
  played: number;
  total: number;
}

// ---- openfootball raw shapes ----------------------------------------------

interface RawGoal {
  name?: string;
  minute?: number;
  penalty?: boolean;
  owngoal?: boolean;
}
interface RawMatch {
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  group?: string;
  ground?: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
  goals1?: RawGoal[];
  goals2?: RawGoal[];
}
interface RawFeed {
  name?: string;
  matches?: RawMatch[];
}

// ---- Team name -> ISO3 code (for flags) ------------------------------------

/** Normalize a team name for tolerant matching across naming variants. */
function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // strip spaces/punctuation
}

/**
 * Build display-name -> code from our own fixtures (matches.json already pairs
 * each resolved team's display with its ISO3 code). A few aliases cover
 * openfootball spelling variants that differ from our display strings.
 */
const NAME_TO_CODE: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const m of matchesData as Match[]) {
    for (const t of [m.team1, m.team2]) {
      if (t.resolved) map.set(norm(t.display), t.code);
    }
  }
  const aliases: Record<string, string> = {
    bosniaherzegovina: "BIH",
    bosniaandherzegovina: "BIH",
    cotedivoire: "CIV",
    ivorycoast: "CIV",
    drcongo: "COD",
    congodr: "COD",
    capeverde: "CPV",
    caboverde: "CPV",
    southkorea: "KOR",
    korearepublic: "KOR",
    usa: "USA",
    unitedstates: "USA",
    iranislamicrepublic: "IRN",
  };
  for (const [k, v] of Object.entries(aliases)) if (!map.has(k)) map.set(k, v);
  return map;
})();

function codeFor(teamName: string): string | null {
  return NAME_TO_CODE.get(norm(teamName)) ?? null;
}

/** Public: ISO3 code for a team name (for odds matching / shared use), or null. */
export function codeForTeamName(teamName: string): string | null {
  return codeFor(teamName);
}

// ---- Parsing / aggregation (pure, unit-testable) ---------------------------

function groupLetter(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/group\s+([a-l])/i);
  return m ? m[1].toUpperCase() : null;
}

function toLiveMatch(rm: RawMatch): LiveMatch {
  const ft = rm.score?.ft;
  const played = Array.isArray(ft) && ft.length === 2;
  return {
    round: rm.round ?? "",
    group: groupLetter(rm.group),
    date: rm.date ?? "",
    ground: rm.ground ?? "",
    team1Name: rm.team1 ?? "",
    team2Name: rm.team2 ?? "",
    team1Code: codeFor(rm.team1 ?? ""),
    team2Code: codeFor(rm.team2 ?? ""),
    played,
    score1: played ? (ft?.[0] ?? null) : null,
    score2: played ? (ft?.[1] ?? null) : null,
  };
}

function emptyRow(name: string): GroupRow {
  return {
    name,
    code: codeFor(name),
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  };
}

function computeGroupStandings(
  matches: LiveMatch[],
): { group: string; rows: GroupRow[] }[] {
  const byGroup = new Map<string, Map<string, GroupRow>>();
  for (const m of matches) {
    if (!m.group) continue;
    const rows = byGroup.get(m.group) ?? new Map<string, GroupRow>();
    if (!rows.has(m.team1Name)) rows.set(m.team1Name, emptyRow(m.team1Name));
    if (!rows.has(m.team2Name)) rows.set(m.team2Name, emptyRow(m.team2Name));
    byGroup.set(m.group, rows);

    if (!m.played || m.score1 === null || m.score2 === null) continue;
    const a = rows.get(m.team1Name);
    const b = rows.get(m.team2Name);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.gf += m.score1;
    a.ga += m.score2;
    b.gf += m.score2;
    b.ga += m.score1;
    if (m.score1 > m.score2) {
      a.won++;
      a.points += 3;
      b.lost++;
    } else if (m.score1 < m.score2) {
      b.won++;
      b.points += 3;
      a.lost++;
    } else {
      a.drawn++;
      b.drawn++;
      a.points++;
      b.points++;
    }
  }

  return [...byGroup.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([group, rows]) => {
      for (const r of rows.values()) r.gd = r.gf - r.ga;
      const sorted = [...rows.values()].sort(
        (p, q) =>
          q.points - p.points ||
          q.gd - p.gd ||
          q.gf - p.gf ||
          p.name.localeCompare(q.name),
      );
      return { group, rows: sorted };
    });
}

function computeTopScorers(rawMatches: RawMatch[]): TopScorer[] {
  const tally = new Map<string, TopScorer>();
  const add = (g: RawGoal, teamName: string) => {
    if (!g.name || g.owngoal) return;
    const key = `${g.name}__${teamName}`;
    const entry =
      tally.get(key) ??
      ({
        player: g.name,
        teamName,
        teamCode: codeFor(teamName),
        goals: 0,
        penalties: 0,
      } satisfies TopScorer);
    entry.goals++;
    if (g.penalty) entry.penalties++;
    tally.set(key, entry);
  };
  for (const rm of rawMatches) {
    for (const g of rm.goals1 ?? []) add(g, rm.team1 ?? "");
    for (const g of rm.goals2 ?? []) add(g, rm.team2 ?? "");
  }
  return [...tally.values()].sort(
    (a, b) =>
      b.goals - a.goals ||
      b.penalties - a.penalties ||
      a.player.localeCompare(b.player),
  );
}

function orderKnockout(
  matches: LiveMatch[],
): { round: string; matches: LiveMatch[] }[] {
  const byRound = new Map<string, LiveMatch[]>();
  const firstDate = new Map<string, string>();
  for (const m of matches) {
    if (m.group) continue; // group stage handled separately
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
    const prev = firstDate.get(m.round);
    if (prev === undefined || m.date < prev) firstDate.set(m.round, m.date);
  }
  return [...byRound.entries()]
    .sort((a, b) =>
      (firstDate.get(a[0]) ?? "").localeCompare(firstDate.get(b[0]) ?? ""),
    )
    .map(([round, list]) => ({ round, matches: list }));
}

/** Parse a raw openfootball feed into the structured WorldCupData. Pure. */
export function parseWorldCup(feed: RawFeed): WorldCupData {
  const rawMatches = feed.matches ?? [];
  const live = rawMatches.map(toLiveMatch);

  const groupMatches = (() => {
    const byGroup = new Map<string, LiveMatch[]>();
    for (const m of live) {
      if (!m.group) continue;
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, matches]) => ({ group, matches }));
  })();

  return {
    groupStandings: computeGroupStandings(live),
    groupMatches,
    knockoutByRound: orderKnockout(live),
    topScorers: computeTopScorers(rawMatches),
    matches: live,
    played: live.filter((m) => m.played).length,
    total: live.length,
  };
}

const EMPTY: WorldCupData = {
  groupStandings: [],
  groupMatches: [],
  knockoutByRound: [],
  topScorers: [],
  matches: [],
  played: 0,
  total: 0,
};

/**
 * Fetch + parse the live feed. Cached for 10 minutes (openfootball updates
 * within hours of a match, so 10m keeps it fresh without hammering GitHub).
 * Never throws — any failure degrades to empty data.
 */
export async function getWorldCupData(): Promise<WorldCupData> {
  try {
    const res = await fetch(SOURCE_URL, { next: { revalidate: 600 } });
    if (!res.ok) return EMPTY;
    const feed = (await res.json()) as RawFeed;
    return parseWorldCup(feed);
  } catch {
    return EMPTY;
  }
}
