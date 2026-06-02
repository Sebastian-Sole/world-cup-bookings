"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { LeaderboardRow } from "@/lib/predictions";
import { cn } from "@/lib/utils";
import { PlayerCardBody } from "./player-card-dialog";

/** Medal for the top three ranks; otherwise the numeric rank. */
const MEDALS = ["🥇", "🥈", "🥉"] as const;

type SortKey =
  | "player"
  | "points"
  | "correct"
  | "incorrect"
  | "accuracy"
  | "streak"
  | "risk";
type SortDir = "asc" | "desc";

/** A row plus its rank in the canonical points-desc ordering. */
interface RankedRow extends LeaderboardRow {
  rank: number;
}

/** Comparator for a given sort key in ascending order. */
function compareBy(key: SortKey, a: LeaderboardRow, b: LeaderboardRow): number {
  switch (key) {
    case "player":
      return a.name.localeCompare(b.name);
    case "points":
      return a.points - b.points || a.correct - b.correct;
    case "correct":
      return a.correct - b.correct || a.points - b.points;
    case "incorrect":
      return a.incorrect - b.incorrect || b.correct - a.correct;
    case "accuracy":
      return a.accuracy - b.accuracy || a.settled - b.settled;
    case "streak":
      return a.streak - b.streak || a.points - b.points;
    case "risk":
      // Unpriced players (no odds) sort below everyone with a risk score.
      return (a.avgOdds ?? -1) - (b.avgOdds ?? -1) || a.points - b.points;
  }
}

function formatAccuracy(row: LeaderboardRow): string {
  if (row.settled === 0) return "—";
  return `${Math.round(row.accuracy * 100)}%`;
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

function StreakCell({ streak }: { streak: number }) {
  if (streak <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">🔥 {streak}</span>;
}

function AccuracyCell({ row }: { row: LeaderboardRow }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        row.settled === 0 && "text-muted-foreground",
      )}
    >
      {formatAccuracy(row)}
    </span>
  );
}

function RiskCell({ row }: { row: LeaderboardRow }) {
  if (row.avgOdds == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums" title="Average odds of their picks">
      {row.avgOdds.toFixed(2)}
    </span>
  );
}

function PendingNote({ pending }: { pending: number }) {
  if (pending <= 0) return null;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {" "}
      (+{pending} pending)
    </span>
  );
}

export function PredictionsLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<RankedRow | null>(null);

  // Canonical rank is the incoming points-desc position (rows is pre-sorted).
  const ranked = useMemo<RankedRow[]>(
    () => rows.map((r, i) => ({ ...r, rank: i + 1 })),
    [rows],
  );

  const visible = useMemo<RankedRow[]>(() => {
    const sorted = [...ranked].sort((a, b) => compareBy(sortKey, a, b));
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [ranked, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text columns read best ascending; counts read best descending.
      setSortDir(key === "player" ? "asc" : "desc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-4xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No predictions yet — pick winners on any match page to get on the board.
      </div>
    );
  }

  return (
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
        <div className="w-20">
          <SortHeader
            label="Points"
            sortKey="points"
            active={sortKey === "points"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
        <div className="w-16">
          <SortHeader
            label="Correct"
            sortKey="correct"
            active={sortKey === "correct"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
        <div className="w-16">
          <SortHeader
            label="Wrong"
            sortKey="incorrect"
            active={sortKey === "incorrect"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
        <div className="w-20">
          <SortHeader
            label="Accuracy"
            sortKey="accuracy"
            active={sortKey === "accuracy"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
        <div className="w-16">
          <SortHeader
            label="Risk"
            sortKey="risk"
            active={sortKey === "risk"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
        <div className="w-16">
          <SortHeader
            label="Streak"
            sortKey="streak"
            active={sortKey === "streak"}
            dir={sortDir}
            align="right"
            onSort={handleSort}
          />
        </div>
      </div>

      <ul className="divide-y">
        {visible.map((r) => (
          <li key={r.playerId}>
            <button
              type="button"
              onClick={() => setSelected(r)}
              aria-label={`Open ${r.name}'s prediction card`}
              className="w-full cursor-pointer px-5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-hidden"
            >
              {/* sm+ : aligned table row */}
              <div className="hidden items-center gap-4 sm:flex">
                <RankBadge rank={r.rank} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.name}
                </span>
                <span className="w-20 text-right font-heading text-lg font-bold tabular-nums">
                  {r.points}
                </span>
                <span className="w-16 text-right tabular-nums">
                  {r.correct}
                </span>
                <span className="w-16 text-right tabular-nums text-muted-foreground">
                  {r.incorrect}
                </span>
                <span className="w-20 text-right">
                  <AccuracyCell row={r} />
                </span>
                <span className="w-16 text-right">
                  <RiskCell row={r} />
                </span>
                <span className="w-16 text-right">
                  <StreakCell streak={r.streak} />
                </span>
              </div>

              {/* mobile : stacked row */}
              <div className="flex items-center gap-3 sm:hidden">
                <RankBadge rank={r.rank} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {r.correct}–{r.incorrect}
                    <PendingNote pending={r.pending} /> ·{" "}
                    <AccuracyCell row={r} />
                    {r.avgOdds != null ? ` · risk ${r.avgOdds.toFixed(2)}` : ""}{" "}
                    · <StreakCell streak={r.streak} />
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-center">
                  <span className="font-heading text-lg font-bold tabular-nums">
                    {r.points}
                  </span>
                  <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                    Points
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          {selected ? <PlayerCardBody row={selected} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
