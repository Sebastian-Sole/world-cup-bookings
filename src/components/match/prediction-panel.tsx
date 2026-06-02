"use client";

import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "@/components/identity-provider";
import { TeamFlag } from "@/components/team-flag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchOdds } from "@/lib/odds";
import type { Match } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PredictionPanelProps {
  match: Match;
  odds: MatchOdds | null;
}

type Pick = "home" | "draw" | "away";

interface PredictionsResponse {
  predictions: { matchId: string; pick: Pick; odds: number | null }[];
}

/** Points a given outcome is worth: its decimal odds, or 1 flat point. */
function pointsLabel(value: number | null): string {
  if (value == null) return "1 pt";
  return `${value.toFixed(2)} pts`;
}

export function PredictionPanel({ match, odds }: PredictionPanelProps) {
  const teamsTbd = !match.team1.resolved || !match.team2.resolved;

  // Shared device identity (set once via the required name gate).
  const { player, ready } = useIdentity();

  // Mount gate: Date.now() differs from the server render, so we only reflect
  // device-specific state after hydration to avoid mismatches.
  const [mounted, setMounted] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Once we know who this device is, fetch their existing pick for this match.
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/predictions?playerId=${encodeURIComponent(player.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as PredictionsResponse;
        const mine = data.predictions.find((p) => p.matchId === match.id);
        if (!cancelled && mine) setPick(mine.pick);
      } catch {
        // Network/DB hiccup — leave pick unset; user can still try to post.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, match.id]);

  const locked = mounted && Date.now() >= new Date(match.kickoffUtc).getTime();

  const choices: {
    value: Pick;
    label: string;
    team: Match["team1"] | null;
    points: number | null;
  }[] = [
    {
      value: "home",
      label: `${match.team1.display} win`,
      team: match.team1,
      points: odds?.home ?? null,
    },
    {
      value: "draw",
      label: "Draw",
      team: null,
      points: odds?.draw ?? null,
    },
    {
      value: "away",
      label: `${match.team2.display} win`,
      team: match.team2,
      points: odds?.away ?? null,
    },
  ];

  async function choose(next: Pick) {
    if (!player || busy || locked) return;
    if (next === pick) return;
    const previous = pick;
    setPick(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.id,
          name: player.name,
          matchId: match.id,
          pick: next,
        }),
      });
      if (!res.ok) {
        setPick(previous); // revert
        if (res.status === 409) {
          toast.error("Predictions just closed — this match kicked off.");
        } else {
          toast.error("Couldn't save your prediction. Please try again.");
        }
        return;
      }
      const data = (await res.json()) as { pick: Pick };
      toast.success(`Locked in: ${labelForPick(data.pick, match)}`);
    } catch {
      setPick(previous);
      toast.error("Couldn't save your prediction. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-5 text-muted-foreground" />
          Your prediction
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {teamsTbd ? (
          <p className="text-sm text-muted-foreground">
            Prediction opens once the teams are confirmed.
          </p>
        ) : (
          <>
            {locked ? (
              <p className="text-sm text-muted-foreground">
                Predictions closed (kicked off)
              </p>
            ) : null}

            {/* Choices. Disabled until identity is ready and not locked. */}
            <div className="flex flex-col gap-2">
              {choices.map((c) => {
                const active = pick === c.value;
                const disabled = !ready || !player || locked || busy;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => choose(c.value)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "bg-muted/40 hover:bg-muted",
                      disabled && !active && "opacity-60",
                      disabled ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {c.team ? (
                        <TeamFlag team={c.team} />
                      ) : (
                        <span
                          aria-hidden
                          className="inline-flex h-[18px] w-6 shrink-0 items-center justify-center rounded-[3px] bg-muted text-[0.6rem] font-semibold text-muted-foreground ring-1 ring-border ring-inset"
                        >
                          ×
                        </span>
                      )}
                      {c.label}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums text-xs",
                        active ? "text-background/80" : "text-muted-foreground",
                      )}
                    >
                      {pointsLabel(c.points)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Who you're predicting as (identity lives in the header chip). */}
            {mounted && player ? (
              <p className="text-xs text-muted-foreground">
                Predicting as{" "}
                <span className="font-medium text-foreground">
                  {player.name}
                </span>
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Human label for a pick, for toasts. */
function labelForPick(pick: Pick, match: Match): string {
  if (pick === "home") return `${match.team1.display} win`;
  if (pick === "away") return `${match.team2.display} win`;
  return "Draw";
}
