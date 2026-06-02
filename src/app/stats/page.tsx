import { Suspense } from "react";
import { StatsTabs } from "@/components/stats/stats-tabs";
import { isAdminRequest } from "@/lib/admin";
import { getMembers, type Member } from "@/lib/players";
import { getLeaderboard, type LeaderboardRow } from "@/lib/predictions";
import { getUsStats, type UsStat } from "@/lib/stats";
import { getWorldCupData, type WorldCupData } from "@/lib/worldcup-live";

export const metadata = { title: "Stats" };

export default async function StatsPage() {
  const isAdmin = await isAdminRequest();

  // World Cup + Player data come live from openfootball (free, keyless, cached).
  // getWorldCupData never throws (degrades to empty), but guard defensively.
  let worldCup: WorldCupData;
  try {
    worldCup = await getWorldCupData();
  } catch {
    worldCup = {
      groupStandings: [],
      groupMatches: [],
      knockoutByRound: [],
      topScorers: [],
      matches: [],
      played: 0,
      total: 0,
    };
  }

  // "Us" counters are the group's own admin-edited numbers (no API source).
  let usStats: UsStat[] = [];
  try {
    usStats = await getUsStats();
  } catch {
    // No DATABASE_URL yet — render with no "Us" counters.
  }

  // Predictions leaderboard (reads from the same DB; guard the same way).
  let leaderboard: LeaderboardRow[] = [];
  try {
    leaderboard = await getLeaderboard();
  } catch {
    // No DATABASE_URL yet — render with an empty leaderboard.
  }

  // Member list (name → sync code) is ADMIN-ONLY: fetched only when isAdmin,
  // so codes are never sent to non-admin clients. Used for code recovery.
  let members: Member[] = [];
  if (isAdmin) {
    try {
      members = await getMembers();
    } catch {
      // No DB — empty member list.
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          Stats
        </h1>
        <p className="text-muted-foreground">
          Live standings &amp; top scorers from openfootball, and how we&apos;re
          doing.
        </p>
      </div>
      <Suspense>
        <StatsTabs
          worldCup={worldCup}
          usStats={usStats}
          isAdmin={isAdmin}
          leaderboard={leaderboard}
          members={members}
        />
      </Suspense>
    </main>
  );
}
