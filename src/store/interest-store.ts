import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-only interest UI state (BUILD_PLAN §5).
 *
 * - `optimistic`: ephemeral per-match delta + locally-added names, shown on top
 *   of server truth between submit and reconcile. NOT persisted.
 * - `submittedMatches`: device-local "did THIS browser RSVP to match X". The
 *   ONLY persisted slice (localStorage key `wc26-submitted`). UX only, not
 *   security.
 *
 * Displayed count = serverCount + (optimistic[id]?.delta ?? 0).
 */

interface OptimisticEntry {
  delta: number;
  names: string[];
}

interface InterestState {
  optimistic: Record<string, OptimisticEntry>;
  submittedMatches: Record<string, true>;
  applyOptimistic: (matchId: string, name: string) => void;
  reconcile: (matchId: string, names: string[], count: number) => void;
  rollback: (matchId: string) => void;
  markSubmitted: (matchId: string) => void;
}

export const useInterestStore = create<InterestState>()(
  persist(
    (set) => ({
      optimistic: {},
      submittedMatches: {},

      applyOptimistic: (matchId, name) =>
        set((state) => {
          const prev = state.optimistic[matchId] ?? { delta: 0, names: [] };
          return {
            optimistic: {
              ...state.optimistic,
              [matchId]: {
                delta: prev.delta + 1,
                names: [...prev.names, name],
              },
            },
          };
        }),

      // Replace the optimistic delta with server truth so the optimistic +1 and
      // the polled value can never double-count. We clear the entry entirely;
      // callers hold the authoritative names/count from the server response.
      reconcile: (matchId, _names, _count) =>
        set((state) => {
          if (!(matchId in state.optimistic)) return state;
          const { [matchId]: _removed, ...rest } = state.optimistic;
          return { optimistic: rest };
        }),

      rollback: (matchId) =>
        set((state) => {
          if (!(matchId in state.optimistic)) return state;
          const { [matchId]: _removed, ...rest } = state.optimistic;
          return { optimistic: rest };
        }),

      markSubmitted: (matchId) =>
        set((state) => ({
          submittedMatches: { ...state.submittedMatches, [matchId]: true },
        })),
    }),
    {
      name: "wc26-submitted",
      // Persist ONLY submittedMatches — optimistic is ephemeral.
      partialize: (state) => ({ submittedMatches: state.submittedMatches }),
    },
  ),
);
