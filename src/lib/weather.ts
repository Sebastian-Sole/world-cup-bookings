import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";
import climateNormalsData from "@/data/climate-normals.json";
import { DISPLAY_TZ, localDateString } from "@/lib/time";
import type { ClimateNormal, Match, MatchWeather } from "@/lib/types";

/**
 * Weather resolution shared by the `/api/weather` route (single match) and the
 * home page (batch, for the calendar squares).
 *
 * The viewing parties happen in Oslo, so weather is always OSLO's weather on
 * the match's (Oslo-local) date — not the venue's. Live forecast when the date
 * is inside Open-Meteo's ~16-day horizon, otherwise the committed Oslo climate
 * normal. Never throws — any failure degrades to the normal.
 */

export const NORMAL_LABEL = "Typical conditions, 2015-2024 average";

/** The single location every match's weather is reported for. */
const OSLO = { lat: 59.9139, lng: 10.7522, tz: DISPLAY_TZ } as const;
/** Climate-normals key holding Oslo's per-MM-DD buckets. */
const OSLO_KEY = "oslo";

const climateNormals = climateNormalsData as Record<
  string,
  Record<string, ClimateNormal>
>;

interface OpenMeteoForecast {
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weather_code?: number[];
  };
}

/**
 * Days from "now" (in the venue tz) to the match's local calendar date, also
 * in the venue tz. Computing in the venue tz — not UTC or the server tz —
 * avoids an off-by-one near midnight (BUILD_PLAN §3.4).
 */
export function daysUntilMatch(kickoffUtc: string, tz: string): number {
  const matchLocal = new TZDate(new Date(kickoffUtc), tz);
  const nowLocal = TZDate.tz(tz);
  return differenceInCalendarDays(matchLocal, nowLocal);
}

/** Day-of-year distance between two MM-DD strings, used for nearest lookup. */
function dayOfYear(mmdd: string): number {
  const [m, d] = mmdd.split("-").map(Number);
  // Use a non-leap reference year; relative ordering is all we need.
  return Math.floor(
    (Date.UTC(2025, m - 1, d) - Date.UTC(2025, 0, 0)) / 86_400_000,
  );
}

function nearestBucket(
  buckets: Record<string, ClimateNormal>,
  mmdd: string,
): ClimateNormal | undefined {
  const target = dayOfYear(mmdd);
  let best: ClimateNormal | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [key, value] of Object.entries(buckets)) {
    const dist = Math.abs(dayOfYear(key) - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = value;
    }
  }
  return best;
}

/**
 * Pick the climate normal for a venue + match date (MM-DD bucket). If the exact
 * bucket is missing, fall back to the nearest available MM-DD for that venue.
 */
export function normalWeather(
  venueId: string,
  matchDate: string,
): MatchWeather {
  const buckets = climateNormals[venueId] ?? {};
  const mmdd = matchDate.slice(5); // "YYYY-MM-DD" -> "MM-DD"

  const normal: ClimateNormal | undefined =
    buckets[mmdd] ?? nearestBucket(buckets, mmdd);

  // Defensive: if a venue somehow has no normals at all, return a neutral
  // payload rather than throwing — weather must never 500 the page.
  if (!normal) {
    return {
      source: "normal",
      label: NORMAL_LABEL,
      tMaxC: 0,
      tMinC: 0,
      precipMm: 0,
      weatherCode: 3,
      date: matchDate,
    };
  }

  return {
    source: "normal",
    label: NORMAL_LABEL,
    tMaxC: normal.tMaxC,
    tMinC: normal.tMinC,
    precipMm: normal.precipMm,
    weatherCode: normal.weatherCode,
    date: matchDate,
  };
}

/**
 * Try Open-Meteo's daily forecast. Returns a forecast MatchWeather if the
 * match date is within the returned horizon, otherwise null (caller falls back
 * to the climate normal). Never throws — any failure resolves to null.
 *
 * The outbound fetch URL is fixed (Oslo), so Next dedupes and caches a single
 * forecast call across every match.
 */
async function forecastWeather(
  matchDate: string,
): Promise<MatchWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(OSLO.lat));
    url.searchParams.set("longitude", String(OSLO.lng));
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
    );
    url.searchParams.set("timezone", OSLO.tz);
    url.searchParams.set("forecast_days", "16");

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoForecast;
    const daily = data.daily;
    const time = daily?.time;
    if (!daily || !time) return null;

    const i = time.indexOf(matchDate);
    if (i === -1) return null; // beyond horizon -> fall back to normal

    const tMaxC = daily.temperature_2m_max?.[i];
    const tMinC = daily.temperature_2m_min?.[i];
    const precipMm = daily.precipitation_sum?.[i];
    const weatherCode = daily.weather_code?.[i];

    if (
      tMaxC == null ||
      tMinC == null ||
      precipMm == null ||
      weatherCode == null
    ) {
      return null;
    }

    return {
      source: "forecast",
      label: "",
      tMaxC,
      tMinC,
      precipMm,
      weatherCode,
      date: matchDate,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a match's Oslo weather (forecast when the Oslo-local match date is
 * in-horizon, else the Oslo climate normal).
 */
export async function resolveWeather(match: Match): Promise<MatchWeather> {
  const matchDate = localDateString(match.kickoffUtc, OSLO.tz);
  const daysUntil = daysUntilMatch(match.kickoffUtc, OSLO.tz);

  let weather: MatchWeather | null = null;
  // Open-Meteo's forecast covers today (index 0) through ~15 days ahead.
  if (daysUntil >= 0 && daysUntil <= 15) {
    weather = await forecastWeather(matchDate);
  }
  return weather ?? normalWeather(OSLO_KEY, matchDate);
}

/**
 * Resolve Oslo weather for many matches at once, keyed by match id. Used to
 * paint the calendar squares without a per-match round-trip. In-horizon dates
 * share a single cached Oslo forecast fetch; the rest are instant lookups.
 */
export async function getWeatherForMatches(
  matches: Match[],
): Promise<Record<string, MatchWeather>> {
  const entries = await Promise.all(
    matches.map(async (match) => {
      const weather = await resolveWeather(match);
      return [match.id, weather] as const;
    }),
  );
  return Object.fromEntries(entries);
}
