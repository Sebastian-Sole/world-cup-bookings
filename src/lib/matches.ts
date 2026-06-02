import matchesData from "@/data/matches.json";
import venuesData from "@/data/venues.json";
import type { Match, Venue } from "@/lib/types";

const matches = matchesData as Match[];
const venues = venuesData as Venue[];

const venuesById = new Map<string, Venue>(venues.map((v) => [v.id, v]));

/** All matches, sorted ascending by kickoff time. */
export function getAllMatches(): Match[] {
  return [...matches].sort(
    (a, b) =>
      new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime(),
  );
}

/** Look up a single match by its stable slug id. */
export function getMatchById(id: string): Match | undefined {
  return matches.find((m) => m.id === id);
}

/** Look up a venue by its id. */
export function getVenue(venueId: string): Venue | undefined {
  return venuesById.get(venueId);
}

/** All venues. */
export function getAllVenues(): Venue[] {
  return venues;
}

/** Distinct group letters present in the fixtures, sorted A→Z. */
export function getGroups(): string[] {
  const groups = new Set<string>();
  for (const m of matches) {
    if (m.group) groups.add(m.group);
  }
  return [...groups].sort();
}

/**
 * Distinct knockout round names, in tournament order.
 * Sorted by the earliest kickoff of any match in that round so the
 * order tracks the real schedule (R32 → … → Final).
 */
export function getKnockoutRounds(): string[] {
  const firstKickoff = new Map<string, number>();
  for (const m of matches) {
    if (m.stage !== "knockout") continue;
    const t = new Date(m.kickoffUtc).getTime();
    const prev = firstKickoff.get(m.round);
    if (prev === undefined || t < prev) firstKickoff.set(m.round, t);
  }
  return [...firstKickoff.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([round]) => round);
}
