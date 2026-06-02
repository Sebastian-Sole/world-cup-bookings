export type Country = "US" | "CA" | "MX";

export interface Venue {
  id: string;
  name: string;
  city: string;
  country: Country;
  lat: number;
  lng: number;
  tz: string; // IANA, e.g. "America/Los_Angeles"
  openfootballGround: string; // raw ground string, must match source exactly
}

export type Stage = "group" | "knockout";

export interface TeamRef {
  code: string; // "MEX" | "2A" | "W74" | "L101"
  display: string; // "Mexico" | "Runner-up Group A" | "Winner of Match 74"
  resolved: boolean;
}

export interface Match {
  id: string; // stable slug (independent of resolved knockout names)
  num: number;
  stage: Stage;
  round: string; // "Matchday 1" | "Round of 32" | "Final"
  group: string | null; // "A".."L" for group stage, null otherwise
  venueId: string;
  kickoffUtc: string; // ISO 8601 Z
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
  label: string; // "" | "Typical conditions, 2015-2024 average"
  tMaxC: number;
  tMinC: number;
  precipMm: number;
  weatherCode: number;
  date: string; // local match date YYYY-MM-DD at venue tz
}

export interface InterestResponse {
  matchId: string;
  count: number;
  names: string[];
  deduped?: boolean; // POST only: true if this name was already present
}

export type InterestCounts = Record<string, number>; // matchId -> count
