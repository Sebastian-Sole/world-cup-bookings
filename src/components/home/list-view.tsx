"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISPLAY_TZ, formatInTz, localDateString } from "@/lib/time";
import type { Match, Venue } from "@/lib/types";
import { MatchCard } from "./match-card";

interface DayGroup {
  key: string;
  label: string;
  matches: Match[];
}

interface ListViewProps {
  matches: Match[];
  venues: Venue[];
  groups: string[];
  knockoutRounds: string[];
}

const ALL = "all";

/** Encode a filter option as a stable string value for the Select. */
function groupValue(letter: string) {
  return `group:${letter}`;
}
function roundValue(round: string) {
  return `round:${round}`;
}

export function ListView({
  matches,
  venues,
  groups,
  knockoutRounds,
}: ListViewProps) {
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState<string>("");

  const venuesById = useMemo(
    () => new Map(venues.map((v) => [v.id, v])),
    [venues],
  );

  // Human labels for each Select option value, used by SelectValue.
  const filterLabels = useMemo(() => {
    const labels: Record<string, string> = { [ALL]: "All matches" };
    for (const g of groups) labels[groupValue(g)] = `Group ${g}`;
    for (const r of knockoutRounds) labels[roundValue(r)] = r;
    return labels;
  }, [groups, knockoutRounds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      // Stage / group / round filter.
      if (filter !== ALL) {
        if (filter.startsWith("group:")) {
          if (m.group !== filter.slice("group:".length)) return false;
        } else if (filter.startsWith("round:")) {
          if (m.round !== filter.slice("round:".length)) return false;
        }
      }
      // Case-insensitive team-name search.
      if (q) {
        const haystack = `${m.team1.display} ${m.team2.display}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [matches, filter, query]);

  // Group into days (Oslo date). `filtered` is already in ascending kickoff
  // order, so the day groups and the matches within each come out in order.
  const byDay = useMemo(() => {
    const days: DayGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const m of filtered) {
      const key = localDateString(m.kickoffUtc, DISPLAY_TZ);
      let i = indexByKey.get(key);
      if (i === undefined) {
        i = days.length;
        indexByKey.set(key, i);
        days.push({
          key,
          label: formatInTz(m.kickoffUtc, DISPLAY_TZ, "EEEE d MMMM"),
          matches: [],
        });
      }
      days[i].matches.push(m);
    }
    return days;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="match-filter">Round</Label>
          <Select
            items={filterLabels}
            value={filter}
            onValueChange={(v) => setFilter((v as string) ?? ALL)}
          >
            <SelectTrigger id="match-filter" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All matches</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={groupValue(g)}>
                  Group {g}
                </SelectItem>
              ))}
              {knockoutRounds.map((r) => (
                <SelectItem key={r} value={roundValue(r)}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="match-search">Search teams</Label>
          <Input
            id="match-search"
            placeholder="e.g. Mexico, Brazil…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "match" : "matches"}
      </p>

      {byDay.length === 0 ? (
        <div className="rounded-4xl border border-dashed p-10 text-center text-muted-foreground">
          No matches found. Try a different round or search.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {byDay.map((day) => (
            <section key={day.key} className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3 border-b pb-2">
                <h3 className="font-heading text-lg font-semibold tracking-tight">
                  {day.label}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {day.matches.length}{" "}
                  {day.matches.length === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {day.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    venue={venuesById.get(m.venueId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
