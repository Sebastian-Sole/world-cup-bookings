"use client";

import { KeyRound } from "lucide-react";
import { PredictionsLeaderboard } from "@/components/stats/predictions-leaderboard";
import type { Member } from "@/lib/players";
import type { LeaderboardRow } from "@/lib/predictions";
import type { UsStat } from "@/lib/stats";
import { UsStatCard } from "./us-stat-card";

export interface UsTabProps {
  stats: UsStat[];
  isAdmin: boolean;
  leaderboard: LeaderboardRow[];
  members: Member[];
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * The "Us" tab: the prediction leaderboard (the headline) over a celebratory
 * grid of big-number counters (beers, attendance, …). Non-admins see the
 * counter numbers only; admins get per-card steppers + a "set exact" control
 * (see UsStatCard), plus an admin-only Members card to recover sync codes.
 * `stats` arrives pre-sorted by sortOrder. `members` is non-empty only for
 * admins (the server doesn't fetch it otherwise).
 */
export function UsTab({ stats, isAdmin, leaderboard, members }: UsTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
          Prediction leaderboard
        </h2>
        <PredictionsLeaderboard rows={leaderboard} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
          The numbers
        </h2>
        {stats.length === 0 ? (
          <div className="rounded-4xl border bg-card p-8 text-center text-muted-foreground">
            No stats yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <UsStatCard key={stat.key} stat={stat} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-muted-foreground" />
            <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              Members &amp; sync codes
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              admin only
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            If someone loses their sync code, read it back to them from here.
          </p>
          {members.length === 0 ? (
            <div className="rounded-4xl border bg-card p-8 text-center text-muted-foreground">
              No members yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-4xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Sync code
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr
                      key={`${m.name}-${i}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-4 py-2 text-right">
                        {m.code ? (
                          <span className="font-mono tracking-wide tabular-nums">
                            {formatCode(m.code)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
