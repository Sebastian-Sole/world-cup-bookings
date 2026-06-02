/**
 * Shared hosting-status vocabulary (no "use client" — imported by both the
 * server DB layer and the client store/components).
 *
 *   available → green  (hosting, room for all)
 *   limited   → yellow (hosting, limited capacity)
 *   blocked   → red    (not hosting / full)
 *
 * Matches with no row default to "available".
 */

export type HostStatus = "available" | "limited" | "blocked";

export const HOST_STATUS_ORDER: HostStatus[] = [
  "available",
  "limited",
  "blocked",
];

export const HOST_STATUS_LABEL: Record<HostStatus, string> = {
  available: "Hosting",
  limited: "Limited capacity",
  blocked: "Not hosting",
};

export function isHostStatus(value: unknown): value is HostStatus {
  return value === "available" || value === "limited" || value === "blocked";
}

/**
 * Status for a match. An explicit (admin-set, DB-backed) value always wins;
 * otherwise it falls back to `fallback` — "available" for normal matches, but
 * callers pass "blocked" for overnight/hidden matches (you don't host a 3am
 * kickoff unless you say so).
 */
export function statusOf(
  map: Record<string, HostStatus>,
  matchId: string,
  fallback: HostStatus = "available",
): HostStatus {
  return map[matchId] ?? fallback;
}

/** The status that follows `current` when cycling the dot. */
export function nextStatus(current: HostStatus): HostStatus {
  return HOST_STATUS_ORDER[
    (HOST_STATUS_ORDER.indexOf(current) + 1) % HOST_STATUS_ORDER.length
  ];
}
