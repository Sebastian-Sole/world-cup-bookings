# World Cup 2026 Viewing-Party Site — FINAL Build Plan

## Changes I made to the draft (read this first)

1. **FIXED a real Neon SQL bug.** The draft wrote queries like `INSERT ... VALUES ($1, $2)` and `WHERE match_id = $1` while using the tagged-template `sql` export. With `@neondatabase/serverless` the tagged template (`sql\`...\``) does **interpolation** — `${val}` becomes a bound parameter — and does **not** accept `$1` placeholders. Numbered `$1` placeholders require the separate `sql.query(text, paramsArray)` method. The draft mixed the two, which would either inject the literal string `$1` or fail. All queries are rewritten to tagged-template form (verified against Neon docs).
2. **FIXED the dedup read-back race / count source.** `ON CONFLICT DO NOTHING` does not tell you reliably whether you inserted unless you check rows. Switched to `... ON CONFLICT DO NOTHING RETURNING id` so `deduped = (result.length === 0)`, then a single follow-up read. Both statements batched in one HTTP transaction.
3. **FIXED knockout example data.** Draft's `matches.json` knockout example narrated "W74" for a Round of 32 match. Verified against openfootball: **R32 uses group-placement codes (`2A`, `2B`, `1C`…), not `W##`. `W##` (winner-of-match) codes appear from the Round of 16/QF onward, and `L###` (loser) appears for the third-place match.** Example corrected and resolver extended for `L###`.
4. **FIXED weather day-boundary correctness.** `daysUntil` must be computed in the **venue's timezone**, comparing the match's local calendar date to "today" in that same tz — not in UTC and not in the server's tz — to avoid an off-by-one near midnight. Also clamped the forecast lookup and added an explicit "forecast horizon = 15 full days ahead" note (Open-Meteo `forecast_days` max is 16 including today).
5. **FIXED a caching contradiction.** Draft set `export const revalidate = 3600` on the weather route **and** `no-store` semantics elsewhere; `revalidate` on a route handler that reads request query params doesn't cache per-matchId the way implied. Replaced route-level `revalidate` with explicit per-fetch caching on the **outbound** Open-Meteo `fetch(..., { next: { revalidate: 3600 } })` (cache key includes the URL/lat/lng), and `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` on the weather **response**. Interest routes stay `no-store`. Reconciled optimistic-vs-cache explicitly.
6. **FIXED home-page self-fetch anti-pattern.** The RSC calling its own `/api/interest/counts` over HTTP requires an absolute URL and adds a hop. Replaced with a shared server function `getCounts()` in `src/lib/interest.ts` that the RSC imports directly; the client polling hook still hits the route handler. One code path, no self-fetch.
7. Tightened types (`deduped` flag, `MatchWeather` source), pinned the `num` derivation rule, added `iso3` mapping caveat, and made the migration idempotent.

Everything else in the draft was verified correct: openfootball shape (group = no `num`, string teams, `time` with embedded `UTC±N`), Open-Meteo archive endpoint/variables/range, shadcn component names, Node-runtime choice for the Neon HTTP driver.

---

## 1. Overview & Architecture

Three independent data sources, no shared runtime coupling.

```
                         ┌────────────────────────────────────────────┐
                         │  REPO (committed, static, build-time)        │
                         │  src/data/matches.json    (104 matches)      │
                         │  src/data/venues.json     (16 venues+tz)     │
                         │  src/data/climate-normals.json (per venue)   │
                         └───────────────┬──────────────────────────────┘
                                         │ imported directly (RSC)
                                         ▼
  Browser  ◄────────  Next.js App Router (Vercel serverless, Node)  ───►  External
   │                  ┌──────────────────────────────────────┐
   │  Zustand         │ RSC pages: / , /match/[id]            │
   │  (UI state,      │  - import matches/venues/normals JSON │
   │   optimistic,    │  - call getCounts()/getInterest()    │
   │   submitted      │    (server fns, NOT self-fetch)      │
   │   slice)         │ Route handlers (client-facing):      │
   │                  │  GET  /api/interest?matchId  ──┐      │
   │  fetch ──────────►  GET  /api/interest/counts   ──┼─► Neon (HTTP) ─ Postgres
   │  (polling +      │  POST /api/interest          ──┘      │   (rsvps table)
   │   optimistic)    │  GET  /api/weather?matchId   ─────────┼─► Open-Meteo
   └──────────────────┘        (forecast OR archive normal)   │  (keyless, CORS-open)
```

**Data-flow rules**
- **Fixtures/venues/normals**: static JSON committed to the repo, imported directly into Server Components. No fetch, no DB. Hand-edited as knockout teams resolve.
- **Interest counts/names**: the only mutable shared state → Neon via route handlers using the `@neondatabase/serverless` HTTP driver. **Node runtime** (`export const runtime = "nodejs"`).
- **Server functions vs route handlers**: RSC pages read interest data through plain async functions in `src/lib/interest.ts` (direct `sql` calls — no HTTP self-fetch). The same data is exposed via route handlers **for the client** (polling + after-mutation refresh).
- **Weather**: fetched server-side in `/api/weather` only (never client→Open-Meteo, so we control caching and the forecast/normal swap). Returns live forecast if the match's local date is within the forecast horizon, else the committed climate normal (clearly labeled).
- **Zustand**: client-only UI state (active tab/filter, optimistic per-match deltas, persisted `submittedMatches`). **Never** the source of truth for shared counts.

---

## 2. Data Layer

### 2.1 Neon table DDL (idempotent)

One table. Run once via `pnpm tsx scripts/migrate.ts` (executes via the HTTP driver) or the Neon SQL console.

```sql
CREATE TABLE IF NOT EXISTS rsvps (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id    TEXT        NOT NULL,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Powers GET /api/interest?matchId= (names+count for one match)
CREATE INDEX IF NOT EXISTS rsvps_match_id_idx ON rsvps (match_id);

-- Dedup: one name per match, case-insensitive (functional unique index).
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_match_name_uniq
  ON rsvps (match_id, lower(name));
```

**Dedup strategy.** `UNIQUE(match_id, lower(name))` + `INSERT ... ON CONFLICT (match_id, lower(name)) DO NOTHING RETURNING id`. If `RETURNING` yields 0 rows, it was a duplicate → respond with `deduped: true`. Known tradeoff: two real people sharing a first name collide; mitigation is "add a last initial" (documented §7).

**No un-RSVP in v1.** Counts are monotonic; the device-level `submittedMatches` slice prevents accidental resubmits from the same browser. `DELETE` deferred.

The counts query needs no extra index — `GROUP BY match_id` over hundreds of rows is trivially fast.

### 2.2 Committed static files

`src/data/venues.json` — hand-written, 16 entries. `lat`/`lng` + IANA `tz` are load-bearing. `id` is a stable slug. `openfootballGround` must match openfootball's `ground` string **exactly** (the prep script throws on any mismatch).

```jsonc
[
  {
    "id": "mexico-city",
    "name": "Estadio Azteca",
    "city": "Mexico City",
    "country": "MX",
    "lat": 19.3029, "lng": -99.1505,
    "tz": "America/Mexico_City",
    "openfootballGround": "Mexico City"
  },
  {
    "id": "los-angeles",
    "name": "SoFi Stadium",
    "city": "Inglewood, CA",
    "country": "US",
    "lat": 33.9535, "lng": -118.3392,
    "tz": "America/Los_Angeles",
    "openfootballGround": "Los Angeles (Inglewood)"
  }
  // 14 more: Atlanta, Boston(Foxborough), Dallas(Arlington), Houston,
  // Kansas City, Miami(Gardens), New York New Jersey(East Rutherford),
  // Philadelphia, San Francisco Bay Area(Santa Clara), Seattle,
  // Toronto, Vancouver, Guadalajara, Monterrey
  // NOTE: confirm each `openfootballGround` against the live JSON before committing.
]
```

`src/data/matches.json` — generated by §2.4, then hand-edited for resolved knockout teams. **Corrected examples** (R32 uses group-placement codes; `W##` is a later-round example):

```jsonc
[
  {
    "id": "2026-06-11-mexico-vs-south-africa",
    "num": 1,
    "stage": "group",
    "round": "Matchday 1",
    "group": "A",
    "venueId": "mexico-city",
    "kickoffUtc": "2026-06-11T19:00:00.000Z",
    "team1": { "code": "MEX", "display": "Mexico", "resolved": true },
    "team2": { "code": "RSA", "display": "South Africa", "resolved": true }
  },
  {
    "id": "2026-06-28-r32-m73",
    "num": 73,
    "stage": "knockout",
    "round": "Round of 32",
    "group": null,
    "venueId": "los-angeles",
    "kickoffUtc": "2026-06-28T19:00:00.000Z",
    "team1": { "code": "2A", "display": "Runner-up Group A", "resolved": false },
    "team2": { "code": "2B", "display": "Runner-up Group B", "resolved": false }
  },
  {
    "id": "2026-07-11-sf-m101",
    "num": 101,
    "stage": "knockout",
    "round": "Semi-final",
    "group": null,
    "venueId": "dallas",
    "kickoffUtc": "2026-07-11T19:00:00.000Z",
    "team1": { "code": "W97", "display": "Winner of Match 97", "resolved": false },
    "team2": { "code": "W98", "display": "Winner of Match 98", "resolved": false }
  }
]
```

`src/data/climate-normals.json` — generated once by §2.4. Keyed by `venueId`, bucketed by `MM-DD`.

```jsonc
{
  "los-angeles": {
    "06-11": { "tMaxC": 24.1, "tMinC": 16.8, "precipMm": 0.3, "weatherCode": 1 },
    "07-09": { "tMaxC": 28.4, "tMinC": 19.2, "precipMm": 0.1, "weatherCode": 0 }
  }
}
```

### 2.3 TypeScript types — `src/lib/types.ts`

```ts
export type Country = "US" | "CA" | "MX";

export interface Venue {
  id: string;
  name: string;
  city: string;
  country: Country;
  lat: number;
  lng: number;
  tz: string;                 // IANA, e.g. "America/Los_Angeles"
  openfootballGround: string; // raw ground string, must match source exactly
}

export type Stage = "group" | "knockout";

export interface TeamRef {
  code: string;     // "MEX" | "2A" | "W74" | "L101"
  display: string;  // "Mexico" | "Runner-up Group A" | "Winner of Match 74"
  resolved: boolean;
}

export interface Match {
  id: string;            // stable slug (independent of resolved knockout names)
  num: number;
  stage: Stage;
  round: string;         // "Matchday 1" | "Round of 32" | "Final"
  group: string | null;  // "A".."L" for group stage, null otherwise
  venueId: string;
  kickoffUtc: string;    // ISO 8601 Z
  team1: TeamRef;
  team2: TeamRef;
}

export interface ClimateNormal {
  tMaxC: number;
  tMinC: number;
  precipMm: number;
  weatherCode: number; // WMO code
}

export interface MatchWeather {
  source: "forecast" | "normal";
  label: string;           // "" | "Typical conditions, 2015-2024 average"
  tMaxC: number;
  tMinC: number;
  precipMm: number;
  weatherCode: number;
  date: string;            // local match date YYYY-MM-DD at venue tz
}

export interface InterestResponse {
  matchId: string;
  count: number;
  names: string[];
  deduped?: boolean; // POST only: true if this name was already present
}

export type InterestCounts = Record<string, number>; // matchId -> count
```

### 2.4 Data-prep script — `scripts/prepare-data.ts`

Run manually (`pnpm tsx scripts/prepare-data.ts`) — **not** at build time. Outputs are committed.

**Inputs:** openfootball URL + hand-authored `src/data/venues.json`.
**Outputs:** writes `src/data/matches.json` and `src/data/climate-normals.json`.

Steps:

1. **Fetch fixtures:** `GET https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`. Shape: `{ name, matches: [...] }` (verified).

2. **Per match, normalize** (verified shape quirks):
   - **`num`:** group matches have **no `num`**; knockout matches do. Rule: iterate `matches` in source order; maintain a running `index` (1-based). If the entry has `num`, use it; else assign the running index. Because openfootball lists matches in match-number order, group matches 1–72 line up with their index, and knockout entries carry their own `num` (73+). Assert at the end that all `num` values are unique and cover `1..104`.
   - **`time` carries an embedded, already-DST-adjusted UTC offset**, e.g. `"13:00 UTC-6"`. Parse `HH:mm` and the literal `UTC±N`. Compute `kickoffUtc = date @ HH:mm minus the literal offset`. **Do NOT recompute the offset from the venue tz** — the source already baked DST in; recomputing would risk double-applying it. (e.g. `2026-06-11 13:00 UTC-6` → `2026-06-11T19:00:00.000Z`.)
   - **`stage`:** `"group"` if a `group` field exists, else `"knockout"`.
   - **`group`:** strip `"Group "` prefix → `"A"`.

3. **Map ground → venueId:** build `openfootballGround → id` from `venues.json`. **Throw loudly** on any unmatched ground (forces venue-list completeness; this is the #1 likely failure, so the script must list all distinct grounds it saw on error).

4. **Stable slug `id`:**
   - Group: `${date}-${slug(team1)}-vs-${slug(team2)}`.
   - Knockout (placeholder teams aren't slug-friendly): `${date}-${roundAbbr}-m${num}` (e.g. `2026-06-28-r32-m73`). `roundAbbr` map: Round of 32→`r32`, Round of 16→`r16`, Quarter-final→`qf`, Semi-final→`sf`, Third-place→`3rd`, Final→`final`.
   - **Ids never depend on resolved knockout names**, so RSVP `match_id`s survive hand-edits.

5. **Placeholder resolver `resolveTeam(code): TeamRef`** (handles BOTH real names and all knockout code forms):
   - Real group team name (contains a space or lowercase letter, i.e. not a placeholder pattern) → `{ code: iso3(name), display: name, resolved: true }`. **`iso3` caveat:** maintain an explicit `Record<countryName, iso3>` map in the script; throw on an unknown country so no team is silently miscoded. `code` is cosmetic for group teams (display is the source of truth).
   - `^([12])([A-L])$` → `{ code, display: `${m[1]==="1"?"Winner":"Runner-up"} Group ${m[2]}`, resolved:false }`. (`2A` → "Runner-up Group A"; `1E` → "Winner Group E".) **This is the R32 case.**
   - `^W(\d+)$` → `{ code, display: `Winner of Match ${n}`, resolved:false }`. (R16/QF/SF/Final.)
   - `^L(\d+)$` → `{ code, display: `Loser of Match ${n}`, resolved:false }`. (Third-place match.)
   - Anything else → **throw** (don't silently pass through unknown codes).
   - **v1 has no automation** to fill resolved knockout names — the engineer hand-edits `team1/team2` `display`/`code`/`resolved` in `matches.json` as results come in. Re-running the prep script overwrites those edits, so **knockout hand-edits are applied after the last prep run** (or guarded — see §7).

6. **Climate normals:** collect the distinct set of `(venueId, MM-DD)` pairs across all matches. For each venue, call the archive API once for the full window:
   ```
   https://archive-api.open-meteo.com/v1/archive
     ?latitude={lat}&longitude={lng}
     &start_date=2015-06-01&end_date=2024-07-31
     &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code
     &timezone={venue.tz}
   ```
   Then, for each `MM-DD` that has a match at that venue, average the four metrics across the 10 occurrences (one per year). For `weather_code`, take the **mode** (most frequent) rather than a meaningless numeric mean. Write `climate-normals.json`. Throttle ~1s between venue calls (16 venues, low volume). Archive data has a 2–5 day publication lag — irrelevant for 2015–2024.

---

## 3. API Route Handlers (App Router, Node runtime)

All under `src/app/api/`. Each route file sets `export const runtime = "nodejs";` (the Neon HTTP driver runs cleanly on Node serverless; avoids edge bundling caveats).

**DB helper — `src/lib/db.ts`:**
```ts
import { neon } from "@neondatabase/serverless";
export const sql = neon(process.env.DATABASE_URL!);
```

**Shared server data fns — `src/lib/interest.ts`** (imported by RSC pages; no HTTP self-fetch):
```ts
import { sql } from "@/lib/db";
import type { InterestCounts, InterestResponse } from "@/lib/types";

export async function getCounts(): Promise<InterestCounts> {
  const rows = await sql`
    SELECT match_id, COUNT(*)::int AS count
    FROM rsvps GROUP BY match_id
  ` as { match_id: string; count: number }[];
  return Object.fromEntries(rows.map(r => [r.match_id, r.count]));
}

export async function getInterest(matchId: string): Promise<InterestResponse> {
  const rows = await sql`
    SELECT name FROM rsvps WHERE match_id = ${matchId} ORDER BY created_at ASC
  ` as { name: string }[];
  return { matchId, count: rows.length, names: rows.map(r => r.name) };
}
```

**Shared zod schemas — `src/lib/validation.ts`:**
```ts
import { z } from "zod";
export const matchIdSchema = z.string().min(3).max(80).regex(/^[a-z0-9-]+$/);
export const nameSchema = z
  .string().trim()
  .transform(s => s.replace(/\s+/g, " "))   // collapse internal whitespace
  .pipe(z.string().min(1).max(40).regex(/^[\p{L}\p{M}\p{N} .'-]+$/u));
export const rsvpBody = z.object({ matchId: matchIdSchema, name: nameSchema });
```

### 3.1 `GET /api/interest?matchId=` — `src/app/api/interest/route.ts`
- Validate `matchId` (400 on fail).
- `return Response.json(await getInterest(matchId))` with header `Cache-Control: no-store` (must reflect new RSVPs).

### 3.2 `GET /api/interest/counts` — `src/app/api/interest/counts/route.ts`
- `return Response.json(await getCounts())`, `Cache-Control: no-store`.
- Used **only by the client polling hook**. RSC home reads `getCounts()` directly.

### 3.3 `POST /api/interest` — `src/app/api/interest/route.ts` (same file, `POST` export)
- Parse + validate body with `rsvpBody` (400 with field errors on fail).
- **Insert + read back in one batched HTTP transaction** (tagged-template form — the corrected, driver-correct syntax):
  ```ts
  const [inserted, rows] = await sql.transaction([
    sql`INSERT INTO rsvps (match_id, name)
        VALUES (${matchId}, ${name})
        ON CONFLICT (match_id, lower(name)) DO NOTHING
        RETURNING id`,
    sql`SELECT name FROM rsvps WHERE match_id = ${matchId} ORDER BY created_at ASC`,
  ]);
  const deduped = (inserted as unknown[]).length === 0;
  const names = (rows as { name: string }[]).map(r => r.name);
  ```
  > Note: `sql.transaction([...])` runs both statements in a single non-interactive HTTP round-trip (supported by the HTTP driver), so the read-back reflects the insert atomically.
- **Response 200** `InterestResponse` `{ matchId, count: names.length, names, deduped }`. `Cache-Control: no-store`.
- **Abuse note:** private group, low risk. Primary defense is the zod length cap + regex. Real rate-limiting deferred (serverless makes in-memory unreliable; a Neon-counted per-IP guard is possible later).

### 3.4 `GET /api/weather?matchId=` — `src/app/api/weather/route.ts`
- Validate `matchId`. Resolve `Match` + `Venue` from imported JSON (404 if unknown).
- **Compute the local match date and `daysUntil` in the VENUE timezone** (off-by-one fix) using `@date-fns/tz`:
  ```ts
  import { TZDate } from "@date-fns/tz";
  import { differenceInCalendarDays } from "date-fns";
  const matchLocal = new TZDate(match.kickoffUtc, venue.tz);   // instant rendered in venue tz
  const nowLocal   = TZDate.tz(venue.tz);                       // "now" in venue tz
  const matchDate  = /* YYYY-MM-DD of matchLocal */;
  const daysUntil  = differenceInCalendarDays(matchLocal, nowLocal);
  ```
- **Decide source:** Open-Meteo forecast covers **today through ~15 days ahead** (`forecast_days` max 16, index 0 = today). Use **forecast** when `0 <= daysUntil <= 15`; otherwise **normal**. (Past matches: `daysUntil < 0` → still serve the normal so detail pages never error.)
- **Forecast call** (server-side, cached):
  ```
  https://api.open-meteo.com/v1/forecast
    ?latitude={lat}&longitude={lng}
    &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code
    &timezone={venue.tz}&forecast_days=16
  ```
  `fetch(url, { next: { revalidate: 3600 } })`. Pick the daily array index whose `time[i] === matchDate`. Map → `MatchWeather { source:"forecast", label:"" }`. **If the matchDate isn't present in the returned `time[]`** (edge of horizon), fall back to the normal.
- **Normal path:** `climate-normals.json[venueId][MM-DD]` → `MatchWeather { source:"normal", label:"Typical conditions, 2015-2024 average" }`. If that bucket is missing, fall back to the nearest available `MM-DD` for the venue, keeping the label.
- **On any Open-Meteo failure:** fall back to the climate normal. **Never 500 the page over weather.**
- **Caching:** outbound fetch cached 1h via `next: { revalidate: 3600 }`; response header `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. (No route-level `export const revalidate` — caching is on the deterministic outbound fetch, keyed by lat/lng, which dedupes across all matchIds sharing a venue.)
- **Response 200** `MatchWeather`.

---

## 4. Pages & shadcn Component Mapping

### 4.1 App structure
```
src/app/
  layout.tsx                 // + <Toaster/> (sonner), fonts, theme
  page.tsx                   // / home (RSC) — imports getCounts()
  match/[id]/page.tsx        // event detail (RSC) — imports getInterest()
  api/interest/route.ts      // GET + POST
  api/interest/counts/route.ts
  api/weather/route.ts
src/components/
  ui/                        // shadcn-generated
  home/{home-tabs,calendar-view,list-view,match-card,interest-badge}.tsx
  match/{match-hero,weather-panel,rsvp-form,attendee-list}.tsx
src/lib/
  db.ts  interest.ts  types.ts  validation.ts  matches.ts (selectors)
  weather-codes.ts  time.ts (tz render helpers)
src/store/
  interest-store.ts          // zustand
src/data/
  matches.json venues.json climate-normals.json
src/hooks/
  use-counts-poll.ts         // focus + interval refetch of /api/interest/counts
scripts/
  prepare-data.ts  migrate.ts
```

### 4.2 `/` home (RSC)
- Server-side: import `matches.json`/`venues.json`; `const initialCounts = await getCounts();`. Pass `matches`, `venues`, `initialCounts` to client components. (No self-fetch.)
- **`HomeTabs`** — Base UI **Tabs** (shadcn `tabs`): **Calendar | List**, synced to `?view=calendar|list` via `useSearchParams` + `router.replace`. Default `calendar`.
- **Calendar view** — shadcn **Calendar** (react-day-picker under the hood) limited to June+July 2026. Per-day match indicators via react-day-picker `modifiers` (mark days that have matches) + the `components.DayButton` slot to render a small count Badge. Each day with matches → **HoverCard** listing that day's matches (teams, kickoff in venue tz, interest Badge). Click a match → `/match/[id]`. (Note: custom day rendering in react-day-picker is fiddly; budget for it in Phase 4.)
- **List view** — filterable **Card** grid:
  - **Select** for stage/group filter (All / Group A–L / Round of 32 / … / Final).
  - **Input** for case-insensitive team-name search over `team.display`.
  - Each **`MatchCard`**: teams, date/time (venue tz via `@date-fns/tz`), venue, **`InterestBadge`** = `initialCounts[id]` + Zustand optimistic delta + polled updates.

### 4.3 `/match/[id]` event detail (RSC)
- Server: resolve `match`+`venue` from JSON (`notFound()` if unknown); `const initial = await getInterest(id);`.
- **`MatchHero`:** teams (unresolved → placeholder text like "Runner-up Group A" + muted "TBD" Badge), round, venue, kickoff in **both** venue-local and viewer-local tz (`time.ts` helper).
- **`WeatherPanel`** (client): fetches `/api/weather?matchId=`; renders temp range, precip, WMO code → lucide icon + text via `weather-codes.ts`. If `source==="normal"`, show `label` prominently (muted Badge) so it's never mistaken for a live forecast. Skeleton while loading.
- **`RsvpForm`** (client): **react-hook-form** + `@hookform/resolvers/zod` with `nameSchema`; shadcn **Form**/**Input**/**Button**. On submit:
  - If Zustand `submittedMatches[id]` → button disabled / "You're in".
  - Else optimistic: `applyOptimistic(id, name)`, `POST /api/interest`; on success `reconcile(id, names, count)` + `markSubmitted(id)` + Sonner success; if `deduped` → info toast "You were already on the list" (still mark submitted); on error → `rollback(id)` + error toast.
- **`AttendeeList`:** names as **Avatar** (initials) + total Badge. Empty state: "Be the first to RSVP."

### 4.4 shadcn components to add (CLI)
```bash
pnpm dlx shadcn@latest add button input form label card badge \
  tabs select calendar hover-card avatar sonner skeleton separator
```
(All names verified valid for shadcn 4.x on Base UI. `sonner` brings the toast lib; `calendar` brings react-day-picker.)

---

## 5. State Management

**Source-of-truth split**
- **Server (Neon):** authoritative counts + names. Always re-read after mutation (done inside the POST transaction).
- **URL (`?view=`):** active home tab (shareable, back-button friendly). List filters MAY also live in URL (`?stage=`, `?q=`) for shareability — recommended; component-local is acceptable in v1.
- **Zustand (`src/store/interest-store.ts`):** client-only UI state.

```ts
interface InterestState {
  optimistic: Record<string, { delta: number; names: string[] }>; // ephemeral
  submittedMatches: Record<string, true>;                         // persisted
  applyOptimistic(matchId: string, name: string): void;
  reconcile(matchId: string, names: string[], count: number): void;
  rollback(matchId: string): void;
  markSubmitted(matchId: string): void;
}
```
- **Persist only `submittedMatches`** via `zustand/middleware` `persist` (localStorage key `wc26-submitted`). Device-local "did THIS device RSVP to match X" — UX only, not security.
- **`optimistic` is ephemeral.** Displayed count = `serverCount + (optimistic[id]?.delta ?? 0)`.

**Optimistic + cache reconciliation (the key coherence rule).** Counts are served `no-store`, so a fresh RSVP is never hidden by a cache. After a successful POST, `reconcile` replaces the optimistic delta with server truth (so the optimistic +1 and the polled value can't double-count). The home polling hook (`use-counts-poll.ts`) refetches `/api/interest/counts` on window `focus` and on a 30–60s visible-tab interval, then merges server truth under any still-pending optimistic deltas. No websockets in v1 — polling suffices for a friend group. Weather is the only cached GET (1h), and weather is immutable per match-day, so there's no optimistic-vs-cache conflict there.

---

## 6. Phased Build Milestones

Each phase is independently deployable to Vercel.

- **Phase 0 — Data prep (BLOCKS EVERYTHING). ~0.5–1 day.** Hand-author `venues.json` (verify each `openfootballGround` against the live JSON). Write/run `scripts/prepare-data.ts` → commit `matches.json` + `climate-normals.json`. Assert: 104 matches, unique `num` 1–104, every match maps to a venue, every `kickoffUtc` parses. Define `src/lib/types.ts`.
- **Phase 1 — Static read-only site. ~1 day.** `/` List view (cards, filters) + `/match/[id]` hero, all from JSON. No DB, no weather. Deployable.
- **Phase 2 — Weather. ~0.5 day.** `/api/weather` + `WeatherPanel`; venue-tz `daysUntil` switch, forecast/normal labeling, graceful fallback.
- **Phase 3 — Persistence/Interest. ~1 day.** Provision Neon, `migrate.ts`, `src/lib/interest.ts`, three routes (GET/POST/counts), `RsvpForm`, `AttendeeList`, Zustand, optimistic + Sonner, counts on detail page.
- **Phase 4 — Calendar view + counts everywhere. ~1–1.5 day.** Calendar custom day rendering (modifiers + `DayButton` Badge), HoverCard, counts wired into home cards + calendar via `getCounts()`/poll hook, `?view=` sync. (Budget extra for react-day-picker custom rendering.)
- **Phase 5 — Polish. ~0.5 day.** Skeletons, empty states, viewer-tz toggle, responsive, a11y, Biome clean.

**Deferred (not v1):** standings/stats page; un-RSVP/DELETE; automated knockout resolution (hand-edit JSON); auth; websockets; rate-limiting beyond input validation.

---

## 7. Risks & Open Questions

- **Neon cold start.** Free tier scales to zero → first query after idle adds ~hundreds of ms. Optimistic UI makes RSVP feel instant. Keep blocking DB reads off the critical render path under Suspense/skeleton where possible (the home `getCounts()` is a fast single query; acceptable, but wrap in Suspense if it ever lags).
- **`openfootballGround` mismatch.** Most likely build-time failure. The prep script must hard-fail and print all distinct grounds seen so the venue list can be corrected. Verify ground strings against the live JSON before committing `venues.json`.
- **Knockout hand-edits vs re-running prep.** Re-running `prepare-data.ts` overwrites manual `resolved` edits. Mitigation: in v1, don't re-run prep after the tournament starts; if regeneration is needed, the script could merge by reading existing `matches.json` and preserving any `resolved:true` team on a matching `id`. Flagged for the engineer; merge-preserve recommended if time permits.
- **Climate normal ≠ forecast.** Most July matches show normals; label unambiguously ("Typical conditions, 2015-2024 average"). As match day nears, the venue-tz `daysUntil` switch + 1h revalidate naturally upgrade to a live forecast.
- **Knockout TBD rendering.** `resolved:false` shows placeholder text; relies on manual edits as results land. Stable slug `id`s ensure RSVPs survive edits.
- **Dedup-by-name tradeoff.** `UNIQUE(match_id, lower(name))` blocks same-first-name collisions; mitigation "add last initial." No un-RSVP means typos are permanent in v1.
- **Weather rate limits.** Open-Meteo free (~10k req/day). `/api/weather` is server-side and the outbound fetch is cached 1h keyed by lat/lng, so requests are heavily deduped across matches at the same venue. Prep script throttled. Low risk.
- **Open question:** URL-sync list filters (`?stage`, `?q`) for shareability vs local state. Recommend URL-synced; flagged.

---

## 8. Setup Checklist

```bash
# 0. Runtime deps
pnpm add @neondatabase/serverless zustand date-fns @date-fns/tz \
  react-hook-form @hookform/resolvers zod
pnpm add -D tsx   # to run scripts

# 1. shadcn components (sonner installs the toast lib)
pnpm dlx shadcn@latest add button input form label card badge \
  tabs select calendar hover-card avatar sonner skeleton separator
```

2. **Provision Neon (Vercel Marketplace):** Vercel dashboard → project → **Storage** → **Create Database** → **Neon** (free plan, no card). It auto-injects `DATABASE_URL` (+ `POSTGRES_*`) into all environments. Run `vercel env pull .env.local` locally.

3. **Local env (`.env.local`):**
   ```
   DATABASE_URL=postgresql://...   # from Neon / vercel env pull
   ```
   No keys for Open-Meteo or openfootball.

4. **Create the table:** run §2.1 DDL in the Neon SQL console **or** `pnpm tsx scripts/migrate.ts` (executes the idempotent `CREATE TABLE` + indexes via the HTTP driver).

5. **Author `src/data/venues.json`** (16 venues; lat/lng + IANA tz; verify `openfootballGround`).

6. **Run data prep ONCE** (local, not CI/build), then commit:
   ```bash
   pnpm tsx scripts/prepare-data.ts
   git add src/data/matches.json src/data/climate-normals.json
   ```

7. **Add `Toaster`** to `src/app/layout.tsx` (`import { Toaster } from "@/components/ui/sonner"`).

8. **Dev / verify / deploy:**
   ```bash
   pnpm dev
   pnpm lint        # biome check
   git push         # Vercel auto-deploys; ensure DATABASE_URL is set in Vercel env
   ```

**Relevant existing files (absolute):**
- `/Users/sebastiansole/Documents/world-cup-bookings/package.json`
- `/Users/sebastiansole/Documents/world-cup-bookings/src/app/layout.tsx`
- `/Users/sebastiansole/Documents/world-cup-bookings/src/lib/utils.ts`
- `/Users/sebastiansole/Documents/world-cup-bookings/src/components/ui/` (shadcn target dir)

**Sources consulted for verification:**
- openfootball 2026 fixtures: https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
- Neon serverless driver (tagged-template vs `sql.query`/`sql.transaction`): https://neon.com/docs/serverless/serverless-driver and https://neon.com/docs/guides/nextjs
- Open-Meteo historical/archive API: https://open-meteo.com/en/docs/historical-weather-api
- shadcn calendar/components: https://ui.shadcn.com/docs/components/radix/calendar