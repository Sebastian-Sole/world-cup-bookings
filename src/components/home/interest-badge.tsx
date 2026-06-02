"use client";

import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMatchCount } from "./counts-provider";

interface InterestBadgeProps {
  matchId: string;
  className?: string;
  /** Hide the badge entirely when the count is 0 (e.g. on dense cards). */
  hideWhenZero?: boolean;
}

/**
 * Displayed interest count for one match (BUILD_PLAN §4.2, §5).
 *
 * The value comes from `useMatchCount`, which reads the shared CountsProvider
 * context. That context already merges the three sources in the correct order:
 *   1. `initialCounts[id]` — server truth from the RSC `getCounts()` (seed),
 *   2. polled `/api/interest/counts` — server truth refreshed on focus/interval,
 *   3. Zustand optimistic delta — layered ON TOP of server truth so a just-
 *      submitted RSVP shows instantly, then collapses into server truth once
 *      `reconcile` clears the delta after the POST round-trips.
 * So this component is a pure presentational read of the already-merged number.
 */
export function InterestBadge({
  matchId,
  className,
  hideWhenZero,
}: InterestBadgeProps) {
  const count = useMatchCount(matchId);

  if (hideWhenZero && count === 0) return null;

  return (
    <Badge
      variant="secondary"
      className={cn("tabular-nums", className)}
      aria-label={`${count} interested`}
    >
      <Users aria-hidden />
      {count}
    </Badge>
  );
}
