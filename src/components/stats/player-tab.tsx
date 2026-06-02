"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { TeamFlag } from "@/components/team-flag";
import { Input } from "@/components/ui/input";
import type { TeamRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TopScorer } from "@/lib/worldcup-live";

export interface PlayerTabProps {
  scorers: TopScorer[];
}

/** Medal for the top three ranks; otherwise the numeric rank. */
const MEDALS = ["🥇", "🥈", "🥉"] as const;

type SortKey = "player" | "team" | "goals" | "penalties";
type SortDir = "asc" | "desc";

/** A scorer plus its rank in the canonical goals-desc ordering. */
interface RankedScorer extends TopScorer {
  rank: number;
}

function teamRef(s: TopScorer): TeamRef {
  return {
    code: s.teamCode ?? "",
    display: s.teamName,
    resolved: s.teamCode != null,
  };
}

/** Comparator for a given sort key in ascending order. */
function compareBy(key: SortKey, a: TopScorer, b: TopScorer): number {
  switch (key) {
    case "player":
      return a.player.localeCompare(b.player);
    case "team":
      return (
        a.teamName.localeCompare(b.teamName) || a.player.localeCompare(b.player)
      );
    case "goals":
      return (
        a.goals - b.goals ||
        a.penalties - b.penalties ||
        b.player.localeCompare(a.player)
      );
    case "penalties":
      return (
        a.penalties - b.penalties ||
        a.goals - b.goals ||
        b.player.localeCompare(a.player)
      );
  }
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onSort: (key: SortKey) => void;
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  align = "left",
  onSort,
}: SortHeaderProps) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={
        active
          ? `${label}, sorted ${dir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
      className={cn(
        "flex w-full items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground",
        align === "right" ? "justify-end" : "justify-start",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="size-3.5" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden />
        )
      ) : (
        <span className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <span
      className={cn(
        "flex w-7 shrink-0 justify-center tabular-nums",
        rank <= 3 ? "font-heading text-lg" : "text-base text-muted-foreground",
      )}
      title={`Rank ${rank}`}
    >
      {medal ?? rank}
    </span>
  );
}

function TeamCell({ scorer }: { scorer: TopScorer }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamFlag team={teamRef(scorer)} size={20} />
      {scorer.teamCode ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {scorer.teamCode}
        </span>
      ) : (
        <span className="truncate text-xs text-muted-foreground">
          {scorer.teamName}
        </span>
      )}
    </div>
  );
}

export function PlayerTab({ scorers }: PlayerTabProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Canonical rank is the incoming goals-desc position (scorers is pre-sorted).
  const ranked = useMemo<RankedScorer[]>(
    () => scorers.map((s, i) => ({ ...s, rank: i + 1 })),
    [scorers],
  );

  const visible = useMemo<RankedScorer[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? ranked.filter(
          (s) =>
            s.player.toLowerCase().includes(q) ||
            s.teamName.toLowerCase().includes(q),
        )
      : ranked;

    const sorted = [...filtered].sort((a, b) => compareBy(sortKey, a, b));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [ranked, query, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text columns read best ascending; counts read best descending.
      setSortDir(key === "player" || key === "team" ? "asc" : "desc");
    }
  }

  if (scorers.length === 0) {
    return (
      <div className="rounded-4xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No goals yet — the leaderboard fills as matches are played.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player or team…"
          aria-label="Search players or teams"
          className="sm:max-w-xs"
        />
        <span
          className="text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {visible.length} {visible.length === 1 ? "player" : "players"}
        </span>
      </div>

      <div className="overflow-hidden rounded-4xl border bg-card">
        {/* Header — real table layout on sm+ */}
        <div className="hidden items-center gap-4 border-b px-5 py-3 sm:flex">
          <span className="w-7 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
            #
          </span>
          <div className="flex-1">
            <SortHeader
              label="Player"
              sortKey="player"
              active={sortKey === "player"}
              dir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-28">
            <SortHeader
              label="Team"
              sortKey="team"
              active={sortKey === "team"}
              dir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-14">
            <SortHeader
              label="Goals"
              sortKey="goals"
              active={sortKey === "goals"}
              dir={sortDir}
              align="right"
              onSort={handleSort}
            />
          </div>
          <div className="w-14">
            <SortHeader
              label="Pens"
              sortKey="penalties"
              active={sortKey === "penalties"}
              dir={sortDir}
              align="right"
              onSort={handleSort}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No players match “{query.trim()}”.
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((s) => (
              <li key={`${s.player}__${s.teamName}`} className="px-5 py-3">
                {/* sm+ : aligned table row */}
                <div className="hidden items-center gap-4 sm:flex">
                  <RankBadge rank={s.rank} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {s.player}
                  </span>
                  <div className="w-28">
                    <TeamCell scorer={s} />
                  </div>
                  <span className="w-14 text-right font-heading text-lg tabular-nums">
                    {s.goals}
                  </span>
                  <span className="w-14 text-right tabular-nums text-muted-foreground">
                    {s.penalties}
                  </span>
                </div>

                {/* mobile : stacked row */}
                <div className="flex items-center gap-3 sm:hidden">
                  <RankBadge rank={s.rank} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{s.player}</span>
                    <TeamCell scorer={s} />
                  </div>
                  <div className="flex shrink-0 items-center gap-5">
                    <div className="flex flex-col items-center">
                      <span className="font-heading text-lg tabular-nums">
                        {s.goals}
                      </span>
                      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                        Goals
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="tabular-nums">{s.penalties}</span>
                      <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                        Pens
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
