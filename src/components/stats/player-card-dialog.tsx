"use client";

import { Check, Minus, TrendingUp, X } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LeaderboardRow, PredictionDetail } from "@/lib/predictions";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** Norwegian-style NOK: signed, space-grouped thousands, no decimals. */
function formatNok(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} kr`;
}

/** Risk persona derived from a player's average picked odds. */
function riskProfile(avg: number): { label: string; hint: string } {
  if (avg < 1.7) {
    return { label: "Plays it safe", hint: "backs the favourites" };
  }
  if (avg < 2.6) {
    return { label: "Balanced", hint: "mixes favourites and underdogs" };
  }
  return { label: "High roller", hint: "loves backing an underdog" };
}

function StatTile({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-3xl border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-heading text-xl font-bold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function PickStatus({ p }: { p: PredictionDetail }) {
  if (p.status === "pending") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3.5" aria-hidden />
        Pending
      </span>
    );
  }
  const won = p.status === "correct";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium tabular-nums",
        won
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      {won ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <X className="size-3.5" aria-hidden />
      )}
      {p.profit != null ? formatNok(p.profit) : won ? "Won" : "Lost"}
    </span>
  );
}

/**
 * Detail card for a single player, shown inside a Dialog. Surfaces their risk
 * appetite (average picked odds), biggest correct call, and the running P&L
 * had they staked a flat 100 NOK on every settled prediction — plus the full
 * pick-by-pick history (most recent first).
 */
export function PlayerCardBody({
  row,
}: {
  row: LeaderboardRow & { rank: number };
}) {
  const { card } = row;
  const medal = row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`;
  const accuracy =
    row.settled === 0 ? "—" : `${Math.round(row.accuracy * 100)}%`;
  const profile = card.avgOdds != null ? riskProfile(card.avgOdds) : null;
  const recent = [...card.predictions].reverse();

  return (
    <>
      <div className="flex items-center gap-3 pr-8">
        <span className="font-heading text-2xl leading-none tabular-nums">
          {medal}
        </span>
        <div className="min-w-0">
          <DialogTitle className="truncate text-xl">{row.name}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {row.points} pts · {row.correct}–{row.incorrect} · {accuracy}
            {row.pending > 0 ? ` · ${row.pending} pending` : ""}
          </DialogDescription>
        </div>
      </div>

      {profile && card.avgOdds != null ? (
        <div className="rounded-3xl border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Avg pick odds
            </span>
            <span className="font-heading text-2xl font-bold tabular-nums">
              {card.avgOdds.toFixed(2)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{profile.label}</span>{" "}
            — {profile.hint}.
          </p>
        </div>
      ) : null}

      {card.hasOdds ? (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="At 100 kr / pick"
            value={formatNok(card.profit)}
            sub={
              card.staked > 0 ? `on ${card.staked} kr staked` : "no bets yet"
            }
            valueClassName={
              card.profit > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : card.profit < 0
                  ? "text-red-600 dark:text-red-400"
                  : undefined
            }
          />
          <StatTile
            label="Biggest win"
            value={
              card.biggestWin ? `${card.biggestWin.odds.toFixed(2)}×` : "—"
            }
            sub={card.biggestWin?.pickLabel ?? "none yet"}
          />
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="min-h-0 overflow-hidden rounded-3xl border bg-card">
          <p className="border-b px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Picks
          </p>
          <ul className="max-h-56 divide-y overflow-y-auto">
            {recent.map((p) => (
              <li
                key={p.matchId}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{p.match}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.pickLabel}
                    {p.odds != null ? ` · ${p.odds.toFixed(2)}` : ""}
                  </p>
                </div>
                <PickStatus p={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!card.hasOdds && card.staked === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="size-4" aria-hidden />
          Odds-based stats appear once matches are played.
        </p>
      ) : null}
    </>
  );
}
