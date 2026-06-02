import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/**
 * Time-zone-aware render helpers for kickoff timestamps.
 *
 * All user-facing dates/times render in a single display zone — the viewing
 * group is in Oslo, so kickoffs are shown in Norwegian time (CEST across the
 * June/July tournament window) rather than each venue's local zone.
 */

/** The single zone every kickoff is rendered in. */
export const DISPLAY_TZ = "Europe/Oslo";
/** Human label for the display zone (always CEST during the tournament). */
export const DISPLAY_TZ_LABEL = "CEST";

/** A `TZDate` for the given UTC instant, rendered in the supplied IANA tz. */
function inTz(kickoffUtc: string, tz: string): TZDate {
  return new TZDate(new Date(kickoffUtc), tz);
}

/**
 * Format a kickoff instant using a date-fns format string, in the given tz.
 * e.g. formatInTz(utc, tz, "EEE d MMM, h:mm a")
 */
export function formatInTz(
  kickoffUtc: string,
  tz: string,
  fmt: string,
): string {
  return format(inTz(kickoffUtc, tz), fmt);
}

/** Local calendar date at the venue tz, as "YYYY-MM-DD". */
export function localDateString(kickoffUtc: string, tz: string): string {
  return format(inTz(kickoffUtc, tz), "yyyy-MM-dd");
}

/** Human date, e.g. "Thu 11 Jun 2026". */
export function formatDate(kickoffUtc: string, tz: string): string {
  return format(inTz(kickoffUtc, tz), "EEE d MMM yyyy");
}

/** Human time, e.g. "3:00 PM". */
export function formatTime(kickoffUtc: string, tz: string): string {
  return format(inTz(kickoffUtc, tz), "h:mm a");
}

/** Hour-of-day (0–23) of a kickoff in the display zone (Oslo). */
export function osloHour(kickoffUtc: string): number {
  return Number(format(inTz(kickoffUtc, DISPLAY_TZ), "H"));
}

/**
 * A "night" kickoff in Oslo: starts between 12:00am (inclusive) and 8:00am
 * (exclusive). These are hidden by default behind the "View hidden" toggle.
 */
export function isNightKickoff(kickoffUtc: string): boolean {
  const h = osloHour(kickoffUtc);
  return h >= 0 && h < 8;
}

/** Combined human date + time, e.g. "Thu 11 Jun 2026, 3:00 PM". */
export function formatDateTime(kickoffUtc: string, tz: string): string {
  return format(inTz(kickoffUtc, tz), "EEE d MMM yyyy, h:mm a");
}
