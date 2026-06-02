"use client";

import { useCallback, useEffect, useState } from "react";
import type { InterestCounts } from "@/lib/types";
import { useInterestStore } from "@/store/interest-store";

const POLL_INTERVAL_MS = 45_000; // 30–60s visible-tab interval (BUILD_PLAN §5)

interface UseCountsPollResult {
  /** Server truth merged with any still-pending optimistic deltas. */
  counts: InterestCounts;
  /** Force an immediate refetch (e.g. after a successful RSVP). */
  refetch: () => void;
}

/**
 * Polls /api/interest/counts on window focus and on a visible-tab interval,
 * then merges server truth under any pending optimistic deltas from the Zustand
 * store (BUILD_PLAN §5). Phase 4 wires the merged counts into the home cards
 * and calendar; the hook is built now so it is ready to consume.
 */
export function useCountsPoll(
  initialCounts: InterestCounts = {},
): UseCountsPollResult {
  const [serverCounts, setServerCounts] =
    useState<InterestCounts>(initialCounts);
  const optimistic = useInterestStore((s) => s.optimistic);

  const refetch = useCallback(() => {
    fetch("/api/interest/counts", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`counts request failed: ${res.status}`);
        return res.json() as Promise<InterestCounts>;
      })
      .then(setServerCounts)
      .catch(() => {
        // Polling is best-effort; keep the last known counts on failure.
      });
  }, []);

  useEffect(() => {
    refetch();

    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refetch]);

  // Merge server truth with pending optimistic deltas.
  const counts: InterestCounts = { ...serverCounts };
  for (const [matchId, entry] of Object.entries(optimistic)) {
    if (entry.delta) {
      counts[matchId] = (counts[matchId] ?? 0) + entry.delta;
    }
  }

  return { counts, refetch };
}
