"use client";

import { CalendarClock, icons } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TeamFlag } from "@/components/team-flag";
import { DISPLAY_TZ, formatTime, localDateString } from "@/lib/time";
import type { Match, MatchWeather, Venue } from "@/lib/types";
import { weatherCodeInfo } from "@/lib/weather-codes";

interface TodaysMatchesProps {
  matches: Match[];
  venues: Venue[];
  weather: Record<string, MatchWeather>;
}

/** Oslo calendar date ("yyyy-MM-dd") for a Date. */
function osloDate(now: Date): string {
  return localDateString(now.toISOString(), DISPLAY_TZ);
}

/**
 * A prominent "campaign banner" above the calendar showing the day's fixtures
 * (or the next match-day if nothing is on today). Purely client-derived from
 * "now", so it renders after mount to stay hydration-safe.
 */
export function TodaysMatches({
  matches,
  venues,
  weather,
}: TodaysMatchesProps) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(osloDate(new Date())), []);

  const venuesById = useMemo(
    () => new Map(venues.map((v) => [v.id, v])),
    [venues],
  );

  // matches grouped by Oslo date, sorted within a day by kickoff
  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const key = localDateString(m.kickoffUtc, DISPLAY_TZ);
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime(),
      );
    }
    return map;
  }, [matches]);

  if (!today) return null; // pre-mount: nothing (avoids hydration mismatch)

  const todays = byDay.get(today) ?? [];
  let label = "Today's matches";
  let dateLabel = "";
  let shown = todays;

  if (todays.length === 0) {
    // Fall back to the next upcoming match-day.
    const nextKey = [...byDay.keys()].filter((k) => k > today).sort()[0];
    if (!nextKey) return null; // tournament over / no upcoming matches
    shown = byDay.get(nextKey) ?? [];
    label = "Up next";
    const [y, m, d] = nextKey.split("-").map(Number);
    dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  return (
    <section className="mb-8 overflow-hidden rounded-3xl bg-foreground text-background shadow-lg">
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5" />
          <h2 className="font-heading text-sm font-semibold tracking-widest uppercase">
            {label}
          </h2>
          {dateLabel ? (
            <span className="text-sm text-background/60">· {dateLabel}</span>
          ) : null}
          <span className="ml-auto text-xs text-background/60">
            {shown.length} {shown.length === 1 ? "match" : "matches"}
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {shown.map((m) => (
            <TodayChip
              key={m.id}
              match={m}
              venue={venuesById.get(m.venueId)}
              weather={weather[m.id]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TodayChip({
  match,
  venue,
  weather,
}: {
  match: Match;
  venue: Venue | undefined;
  weather: MatchWeather | undefined;
}) {
  const w = weather ? weatherCodeInfo(weather.weatherCode) : null;
  const WeatherIcon = w ? (icons[w.icon as keyof typeof icons] ?? null) : null;

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex min-w-44 shrink-0 flex-col gap-2 rounded-2xl bg-background/10 p-3 transition-colors hover:bg-background/20"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tabular-nums text-background/70">
          {formatTime(match.kickoffUtc, DISPLAY_TZ)}
        </span>
        {WeatherIcon && weather ? (
          <span className="flex items-center gap-1 text-xs text-background/70">
            <WeatherIcon className="size-3.5" aria-hidden />
            <span className="tabular-nums">{Math.round(weather.tMaxC)}°</span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <TeamFlag team={match.team1} size={20} />
        {match.team1.code}
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <TeamFlag team={match.team2} size={20} />
        {match.team2.code}
      </div>
      <span className="truncate text-[0.7rem] text-background/55">
        {venue ? `${venue.city}` : "Venue TBD"}
      </span>
    </Link>
  );
}
