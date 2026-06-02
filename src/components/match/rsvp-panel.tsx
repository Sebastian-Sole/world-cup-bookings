"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "@/components/identity-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterestResponse } from "@/lib/types";
import { useInterestStore } from "@/store/interest-store";

interface RsvpPanelProps {
  matchId: string;
  initialNames: string[];
  initialCount: number;
}

/** Initials for an avatar fallback: first letter of up to the first two words. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

export function RsvpPanel({
  matchId,
  initialNames,
  initialCount,
}: RsvpPanelProps) {
  // Server truth lives in local state, refreshed from POST responses.
  const [names, setNames] = useState<string[]>(initialNames);
  const [count, setCount] = useState<number>(initialCount);
  const [submitting, setSubmitting] = useState(false);

  // The shared device identity — one name set once via the required gate, so
  // `player` is effectively always present here. Guard defensively regardless.
  const { player, ready } = useIdentity();

  const optimisticEntry = useInterestStore((s) => s.optimistic[matchId]);
  const submittedStored = useInterestStore((s) =>
    Boolean(s.submittedMatches[matchId]),
  );
  // `submittedMatches` is persisted to localStorage, which the zustand store
  // rehydrates on the client before first paint — so reading it during the
  // initial render would mismatch the server (which has no localStorage). Gate
  // it behind a mount flag: server + first client render both show "not
  // submitted", then it reflects the real value after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const submitted = mounted && submittedStored;
  const applyOptimistic = useInterestStore((s) => s.applyOptimistic);
  const reconcile = useInterestStore((s) => s.reconcile);
  const rollback = useInterestStore((s) => s.rollback);
  const markSubmitted = useInterestStore((s) => s.markSubmitted);

  // Display = server names + any still-pending optimistic names.
  const displayNames = [...names, ...(optimisticEntry?.names ?? [])];
  const displayCount = count + (optimisticEntry?.delta ?? 0);

  async function onRsvp() {
    if (!ready || !player) return;
    const name = player.name;
    setSubmitting(true);
    applyOptimistic(matchId, name);

    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, name, playerId: player.id }),
      });

      if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);

      const data = (await res.json()) as InterestResponse;

      // Adopt server truth, then clear the optimistic delta (avoids double-count).
      setNames(data.names);
      setCount(data.count);
      reconcile(matchId, data.names, data.count);
      markSubmitted(matchId);

      if (data.deduped) {
        toast.info("You were already on the list");
      } else {
        toast.success("You're in!");
      }
    } catch {
      rollback(matchId);
      toast.error("Couldn't save your RSVP. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          Who&apos;s in?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {submitted ? (
          <Button type="button" disabled className="w-full">
            You&apos;re in
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onRsvp}
            disabled={submitting || !ready || !player}
            className="w-full"
          >
            {submitting ? "Adding…" : "I'm watching"}
          </Button>
        )}

        <AttendeeList names={displayNames} count={displayCount} />
      </CardContent>
    </Card>
  );
}

function AttendeeList({ names, count }: { names: string[]; count: number }) {
  if (names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Be the first to RSVP.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Watching</span>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {names.map((name, i) => (
          // Append-only, stably-ordered list (created_at asc + optimistic
          // appended last); names may repeat, so index keeps keys unique.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable append-only order
          <li key={`${name}-${i}`} className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="text-sm">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
