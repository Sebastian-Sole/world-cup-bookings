"use client";

import { createContext, type ReactNode, useContext } from "react";
import { useCountsPoll } from "@/hooks/use-counts-poll";
import type { InterestCounts } from "@/lib/types";

/**
 * Single-poller architecture (BUILD_PLAN §5).
 *
 * `useCountsPoll` is mounted exactly once here, at the home client boundary, so
 * the whole home page (List cards + Calendar) shares ONE polling loop and ONE
 * merge of server truth + Zustand optimistic deltas. Children read the merged
 * counts via context instead of each mounting their own poller — mounting 100+
 * independent pollers would hammer /api/interest/counts.
 */
const CountsContext = createContext<InterestCounts>({});

export function CountsProvider({
  initialCounts,
  children,
}: {
  initialCounts: InterestCounts;
  children: ReactNode;
}) {
  const { counts } = useCountsPoll(initialCounts);
  return (
    <CountsContext.Provider value={counts}>{children}</CountsContext.Provider>
  );
}

/** Merged interest counts (server truth + pending optimistic deltas). */
export function useCounts(): InterestCounts {
  return useContext(CountsContext);
}

/** Count for a single match, defaulting to 0 when unknown. */
export function useMatchCount(matchId: string): number {
  return useContext(CountsContext)[matchId] ?? 0;
}
