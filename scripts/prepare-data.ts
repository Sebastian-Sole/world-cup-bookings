/**
 * Data-prep script (run manually, NOT at build time):
 *   pnpm tsx scripts/prepare-data.ts
 *
 * Inputs:
 *   - openfootball 2026 fixtures (remote JSON)
 *   - src/data/venues.json (hand-authored)
 * Outputs (committed):
 *   - src/data/matches.json
 *   - src/data/climate-normals.json
 *
 * See BUILD_PLAN.md §2.4.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import venues from "../src/data/venues.json" with { type: "json" };
import type {
  ClimateNormal,
  Match,
  Stage,
  TeamRef,
  Venue,
} from "../src/lib/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../src/data");

const FIXTURES_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

interface SourceMatch {
  round: string;
  num?: number;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground: string;
}

interface SourceFile {
  name: string;
  matches: SourceMatch[];
}

const venueList = venues as Venue[];

// ---------------------------------------------------------------------------
// Country name -> ISO3 map (explicit; throw on unknown so nothing is miscoded).
// ---------------------------------------------------------------------------
const ISO3: Record<string, string> = {
  Algeria: "ALG",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  "Bosnia & Herzegovina": "BIH",
  Brazil: "BRA",
  Canada: "CAN",
  "Cape Verde": "CPV",
  Colombia: "COL",
  Croatia: "CRO",
  Curaçao: "CUW",
  "Czech Republic": "CZE",
  "DR Congo": "COD",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  Ghana: "GHA",
  Haiti: "HAI",
  Iran: "IRN",
  Iraq: "IRQ",
  "Ivory Coast": "CIV",
  Japan: "JPN",
  Jordan: "JOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  "New Zealand": "NZL",
  Norway: "NOR",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Tunisia: "TUN",
  Turkey: "TUR",
  USA: "USA",
  Uruguay: "URU",
  Uzbekistan: "UZB",
};

// round -> abbreviation for knockout slug ids
const ROUND_ABBR: Record<string, string> = {
  "Round of 32": "r32",
  "Round of 16": "r16",
  "Quarter-final": "qf",
  "Semi-final": "sf",
  "Match for third place": "3rd",
  Final: "final",
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// time parsing: "13:00 UTC-6" -> ISO 8601 Z. The literal offset is already
// DST-adjusted at the source; do NOT recompute it from the venue tz.
// ---------------------------------------------------------------------------
function toKickoffUtc(date: string, time: string): string {
  const m = /^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/.exec(time.trim());
  if (!m) throw new Error(`Unparseable time: "${time}"`);
  const [, hh, mm, off] = m;
  const offsetHours = Number(off);
  // Local wall-clock minus the literal offset = UTC.
  // Build the UTC instant directly from the components.
  const [y, mo, d] = date.split("-").map(Number);
  const utcMs = Date.UTC(
    y,
    mo - 1,
    d,
    Number(hh) - offsetHours,
    Number(mm),
    0,
    0,
  );
  return new Date(utcMs).toISOString();
}

// ---------------------------------------------------------------------------
// resolveTeam: handles real group names + all knockout placeholder forms.
// Throws on anything unrecognized.
// ---------------------------------------------------------------------------
function resolveTeam(code: string): TeamRef {
  // Group-placement code: 2A, 1E, ...  (R32 group winners/runners-up)
  let m = /^([12])([A-L])$/.exec(code);
  if (m) {
    return {
      code,
      display: `${m[1] === "1" ? "Winner" : "Runner-up"} Group ${m[2]}`,
      resolved: false,
    };
  }
  // Best-third-placed-team combo: 3A/B/C/D/F  (R32)
  m = /^3([A-L])(?:\/[A-L])+$/.exec(code);
  if (m) {
    const groups = code.slice(1).split("/").join("/");
    return {
      code,
      display: `3rd Place Group ${groups}`,
      resolved: false,
    };
  }
  // Winner of match: W74 (R16/QF/SF/Final)
  m = /^W(\d+)$/.exec(code);
  if (m) {
    return {
      code,
      display: `Winner of Match ${m[1]}`,
      resolved: false,
    };
  }
  // Loser of match: L101 (third-place match)
  m = /^L(\d+)$/.exec(code);
  if (m) {
    return {
      code,
      display: `Loser of Match ${m[1]}`,
      resolved: false,
    };
  }
  // Real group team name: must be in the ISO3 map.
  const iso = ISO3[code];
  if (!iso) {
    throw new Error(
      `Unknown team / placeholder code: "${code}". Add it to ISO3 or extend the resolver.`,
    );
  }
  return { code: iso, display: code, resolved: true };
}

// ---------------------------------------------------------------------------
// Open-Meteo climate normals (archive API), averaged over 2015-2024.
// ---------------------------------------------------------------------------
interface ArchiveDaily {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  weather_code: (number | null)[];
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mode(xs: number[]): number {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = xs[0];
  let bestN = -1;
  for (const [val, n] of counts) {
    if (n > bestN) {
      best = val;
      bestN = n;
    }
  }
  return best;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchArchive(venue: Venue): Promise<ArchiveDaily> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${venue.lat}&longitude=${venue.lng}` +
    `&start_date=2015-06-01&end_date=2024-07-31` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
    `&timezone=${encodeURIComponent(venue.tz)}`;
  let lastStatus = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as { daily: ArchiveDaily };
      return json.daily;
    }
    lastStatus = `${res.status} ${res.statusText}`;
    if (res.status === 429) {
      const backoff = 5000 * (attempt + 1);
      console.log(`  429 for ${venue.id}; backing off ${backoff}ms…`);
      await sleep(backoff);
      continue;
    }
    break;
  }
  throw new Error(`Open-Meteo archive failed for ${venue.id}: ${lastStatus}`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("Fetching fixtures…");
  const res = await fetch(FIXTURES_URL);
  if (!res.ok) {
    throw new Error(`Fixtures fetch failed: ${res.status} ${res.statusText}`);
  }
  const source = (await res.json()) as SourceFile;
  console.log(`  ${source.matches.length} source matches`);

  // ground -> venueId map; throw (listing all distinct grounds) on mismatch.
  const groundToVenue = new Map<string, string>();
  for (const v of venueList) groundToVenue.set(v.openfootballGround, v.id);

  const matches: Match[] = [];
  let index = 0;
  const unmatchedGrounds = new Set<string>();

  for (const sm of source.matches) {
    index += 1;
    const num = sm.num != null ? sm.num : index;

    const venueId = groundToVenue.get(sm.ground);
    if (!venueId) {
      unmatchedGrounds.add(sm.ground);
      continue;
    }

    const stage: Stage = sm.group ? "group" : "knockout";
    const group = sm.group ? sm.group.replace(/^Group\s+/, "") : null;
    const kickoffUtc = toKickoffUtc(sm.date, sm.time);
    const team1 = resolveTeam(sm.team1);
    const team2 = resolveTeam(sm.team2);

    let id: string;
    if (stage === "group") {
      id = `${sm.date}-${slug(team1.display)}-vs-${slug(team2.display)}`;
    } else {
      const abbr = ROUND_ABBR[sm.round];
      if (!abbr) throw new Error(`Unknown knockout round: "${sm.round}"`);
      id = `${sm.date}-${abbr}-m${num}`;
    }

    matches.push({
      id,
      num,
      stage,
      round: sm.round,
      group,
      venueId,
      kickoffUtc,
      team1,
      team2,
    });
  }

  if (unmatchedGrounds.size > 0) {
    const allGrounds = [...new Set(source.matches.map((m) => m.ground))].sort();
    throw new Error(
      `Unmatched openfootballGround(s): ${[...unmatchedGrounds]
        .map((g) => JSON.stringify(g))
        .join(", ")}\n` +
        `All distinct grounds in source:\n${allGrounds
          .map((g) => `  ${JSON.stringify(g)}`)
          .join("\n")}\n` +
        `Fix src/data/venues.json so every distinct ground maps to a venue.`,
    );
  }

  // num assertions
  const nums = matches.map((m) => m.num);
  const uniqueNums = new Set(nums);
  if (uniqueNums.size !== nums.length) {
    throw new Error(
      `num values are not unique (${nums.length} matches, ${uniqueNums.size} unique)`,
    );
  }
  for (let i = 1; i <= matches.length; i += 1) {
    if (!uniqueNums.has(i)) {
      throw new Error(
        `num coverage gap: ${i} missing (expected 1..${matches.length})`,
      );
    }
  }

  matches.sort((a, b) => a.num - b.num);

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    resolve(DATA_DIR, "matches.json"),
    `${JSON.stringify(matches, null, 2)}\n`,
  );
  console.log(
    `Wrote matches.json (${matches.length} matches, num 1..${matches.length})`,
  );

  // -------------------------------------------------------------------------
  // Climate normals
  // -------------------------------------------------------------------------
  // distinct (venueId, MM-DD) pairs needed.
  const needed = new Map<string, Set<string>>(); // venueId -> set of MM-DD
  for (const m of matches) {
    // Key on the match's LOCAL date at the venue tz (matches the archive
    // rows, which are also requested in venue tz).
    const venue = venueList.find((v) => v.id === m.venueId);
    if (!venue) throw new Error(`No venue for match ${m.id}`);
    const localMmDd = localMonthDay(m.kickoffUtc, venue.tz);
    if (!needed.has(m.venueId)) needed.set(m.venueId, new Set());
    needed.get(m.venueId)?.add(localMmDd);
  }

  const normals: Record<string, Record<string, ClimateNormal>> = {};

  const venuesWithMatches = venueList.filter((v) => needed.has(v.id));
  for (let i = 0; i < venuesWithMatches.length; i += 1) {
    const venue = venuesWithMatches[i];
    console.log(`Climate (${i + 1}/${venuesWithMatches.length}): ${venue.id}…`);
    const daily = await fetchArchive(venue);

    // group archive rows by MM-DD
    const byMmDd = new Map<
      string,
      { tMax: number[]; tMin: number[]; precip: number[]; wcode: number[] }
    >();
    for (let j = 0; j < daily.time.length; j += 1) {
      const mmdd = daily.time[j].slice(5, 10);
      const tMax = daily.temperature_2m_max[j];
      const tMin = daily.temperature_2m_min[j];
      const precip = daily.precipitation_sum[j];
      const wcode = daily.weather_code[j];
      if (tMax == null || tMin == null || precip == null || wcode == null)
        continue;
      if (!byMmDd.has(mmdd))
        byMmDd.set(mmdd, { tMax: [], tMin: [], precip: [], wcode: [] });
      const bucket = byMmDd.get(mmdd);
      if (!bucket) continue;
      bucket.tMax.push(tMax);
      bucket.tMin.push(tMin);
      bucket.precip.push(precip);
      bucket.wcode.push(wcode);
    }

    const venueNormals: Record<string, ClimateNormal> = {};
    for (const mmdd of needed.get(venue.id) ?? []) {
      const bucket = byMmDd.get(mmdd);
      if (!bucket || bucket.tMax.length === 0) {
        throw new Error(`No archive data for ${venue.id} ${mmdd}`);
      }
      venueNormals[mmdd] = {
        tMaxC: round1(mean(bucket.tMax)),
        tMinC: round1(mean(bucket.tMin)),
        precipMm: round1(mean(bucket.precip)),
        weatherCode: mode(bucket.wcode),
      };
    }
    normals[venue.id] = venueNormals;

    if (i < venuesWithMatches.length - 1) await sleep(2000); // throttle ~2s
  }

  await writeFile(
    resolve(DATA_DIR, "climate-normals.json"),
    `${JSON.stringify(normals, null, 2)}\n`,
  );
  console.log(
    `Wrote climate-normals.json (${Object.keys(normals).length} venues)`,
  );
  console.log("Done.");
}

// MM-DD of an ISO instant rendered in a given IANA tz.
function localMonthDay(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${month}-${day}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
