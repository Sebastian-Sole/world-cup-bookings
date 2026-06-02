"use client";

import {
  Activity,
  Beer,
  Flame,
  type LucideIcon,
  Minus,
  Plus,
  Tv,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UsStat } from "@/lib/stats";

// Matches the API/db bound (z.number().int().min(0).max(1_000_000)).
const MAX_VALUE = 1_000_000;

/** Lucide icon per known stat key; generic fallback for anything unknown. */
function iconFor(key: string): LucideIcon {
  switch (key) {
    case "beers":
      return Beer;
    case "attendance":
      return Users;
    case "games_watched":
      return Tv;
    case "grill_food":
      return Flame;
    default:
      return Activity;
  }
}

/** POST an absolute value for one counter. Returns true on success. */
async function postValue(key: string, value: number): Promise<boolean> {
  try {
    const res = await fetch("/api/us-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const clamp = (n: number) => Math.max(0, Math.min(MAX_VALUE, Math.round(n)));

/**
 * A big-number stat card. Read-only for non-admins; admins get quick steppers
 * (−1 / +1 / +5 / +10) and a "set exact" input. Optimistic: the displayed value
 * updates instantly, the POST runs in the background, and a failure reverts +
 * toasts. `router.refresh()` after success keeps server truth canonical.
 */
export function UsStatCard({
  stat,
  isAdmin,
}: {
  stat: UsStat;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const Icon = iconFor(stat.key);

  const [value, setValue] = useState(stat.value);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(String(stat.value));

  // Keep local state in sync when server-rendered props change (e.g. another
  // viewer's edit lands via router.refresh()).
  useEffect(() => {
    setValue(stat.value);
    setDraft(String(stat.value));
  }, [stat.value]);

  async function commit(next: number) {
    const target = clamp(next);
    if (target === value || busy) return;

    const previous = value;
    setValue(target); // optimistic
    setDraft(String(target));
    setBusy(true);
    const ok = await postValue(stat.key, target);
    setBusy(false);
    if (ok) {
      router.refresh();
    } else {
      setValue(previous); // revert
      setDraft(String(previous));
      toast.error("Couldn't update. Check your connection / login.");
    }
  }

  function onSetExact(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      toast.error("Enter a number.");
      setDraft(String(value));
      return;
    }
    commit(parsed);
  }

  return (
    <div className="flex flex-col gap-4 rounded-4xl border bg-card p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-5" aria-hidden />
        <span className="text-sm font-medium tracking-wide uppercase">
          {stat.label}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <span
          className="font-heading text-5xl leading-none font-bold tabular-nums sm:text-6xl"
          aria-live="polite"
        >
          {value.toLocaleString()}
        </span>
        {stat.unit ? (
          <span className="pb-1 text-sm text-muted-foreground">
            {stat.unit}
          </span>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={busy || value <= 0}
              aria-label={`Decrease ${stat.label}`}
              onClick={() => commit(value - 1)}
            >
              <Minus />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={busy || value >= MAX_VALUE}
              aria-label={`Increase ${stat.label}`}
              onClick={() => commit(value + 1)}
            >
              <Plus />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || value >= MAX_VALUE}
              onClick={() => commit(value + 5)}
            >
              +5
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || value >= MAX_VALUE}
              onClick={() => commit(value + 10)}
            >
              +10
            </Button>
          </div>

          <form onSubmit={onSetExact} className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_VALUE}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Set exact value for ${stat.label}`}
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={busy}>
              Set
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
