"use client";

import type { UsStat } from "@/lib/stats";
import { UsStatCard } from "./us-stat-card";

export interface UsTabProps {
  stats: UsStat[];
  isAdmin: boolean;
}

/**
 * The "Us" tab: a celebratory grid of big-number counters (beers, attendance,
 * …). Non-admins see the numbers only; admins get per-card steppers + a "set
 * exact" control (see UsStatCard). `stats` arrives pre-sorted by sortOrder.
 */
export function UsTab({ stats, isAdmin }: UsTabProps) {
  if (stats.length === 0) {
    return (
      <div className="rounded-4xl border bg-card p-8 text-center text-muted-foreground">
        No stats yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <UsStatCard key={stat.key} stat={stat} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
