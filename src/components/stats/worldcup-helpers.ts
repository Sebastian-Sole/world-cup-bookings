import { format } from "date-fns";
import type { TeamRef } from "@/lib/types";
import type { GroupRow, LiveMatch } from "@/lib/worldcup-live";

/** Build a TeamFlag-ready TeamRef from a live match's first team. */
export function team1Ref(m: LiveMatch): TeamRef {
  return {
    code: m.team1Code ?? "",
    display: m.team1Name,
    resolved: m.team1Code != null,
  };
}

/** Build a TeamFlag-ready TeamRef from a live match's second team. */
export function team2Ref(m: LiveMatch): TeamRef {
  return {
    code: m.team2Code ?? "",
    display: m.team2Name,
    resolved: m.team2Code != null,
  };
}

/** Build a TeamFlag-ready TeamRef from a standings row. */
export function rowRef(row: GroupRow): TeamRef {
  return {
    code: row.code ?? "",
    display: row.name,
    resolved: row.code != null,
  };
}

/**
 * Format a live "YYYY-MM-DD" date deterministically (noon avoids tz drift).
 * The feed carries no kickoff time, so we never render a clock time.
 */
export function formatMatchDate(date: string): string {
  if (!date) return "TBD";
  return format(new Date(`${date}T12:00:00`), "EEE d MMM");
}
