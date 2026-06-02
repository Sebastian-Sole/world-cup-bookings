"use client";

import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  icons,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HostStatusDot } from "@/components/host-status";
import { TeamFlag } from "@/components/team-flag";
import { Badge } from "@/components/ui/badge";
import { DISPLAY_TZ, formatTime, localDateString } from "@/lib/time";
import type { Match, MatchWeather, Venue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { weatherCodeInfo } from "@/lib/weather-codes";
import { useCounts } from "./counts-provider";

interface CalendarViewProps {
  matches: Match[];
  venues: Venue[];
  weather: Record<string, MatchWeather>;
}

/**
 * Day-bucketing tz: every match is filed under its calendar date in the
 * display zone (Oslo/CEST), the same zone its kickoff time is shown in, so the
 * day a fixture lands on always agrees with the time printed on it.
 */
const MONTHS = [
  { year: 2026, month: 5, label: "June 2026" }, // month index 5 = June
  { year: 2026, month: 6, label: "July 2026" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayMatch {
  match: Match;
  venue: Venue | undefined;
}

/** Build a "yyyy-MM-dd" -> matches[] index keyed by Oslo-local date. */
function bucketByDay(
  matches: Match[],
  venuesById: Map<string, Venue>,
): Map<string, DayMatch[]> {
  const byDay = new Map<string, DayMatch[]>();
  for (const match of matches) {
    const venue = venuesById.get(match.venueId);
    const key = localDateString(match.kickoffUtc, DISPLAY_TZ);
    const entry: DayMatch = { match, venue };
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }
  for (const bucket of byDay.values()) {
    bucket.sort(
      (a, b) =>
        new Date(a.match.kickoffUtc).getTime() -
        new Date(b.match.kickoffUtc).getTime(),
    );
  }
  return byDay;
}

/** Local "yyyy-MM-dd" for a Y/M/D triple. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const now = new Date();
  return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Index of the month containing today, or 0 if today is outside the window. */
function initialMonthIndex(today: string): number {
  const idx = MONTHS.findIndex((m) =>
    today.startsWith(`${m.year}-${String(m.month + 1).padStart(2, "0")}`),
  );
  return idx === -1 ? 0 : idx;
}

export function CalendarView({ matches, venues, weather }: CalendarViewProps) {
  // "today" depends on the clock/tz, which can differ between the server render
  // and the browser — so we resolve it AFTER mount to stay hydration-safe. SSR
  // and the first client render both use "" (no highlight) + month index 0.
  const [today, setToday] = useState("");
  const [monthIndex, setMonthIndex] = useState(0);
  useEffect(() => {
    const t = todayKey();
    setToday(t);
    setMonthIndex(initialMonthIndex(t));
  }, []);

  const venuesById = useMemo(
    () => new Map(venues.map((v) => [v.id, v])),
    [venues],
  );
  const byDay = useMemo(
    () => bucketByDay(matches, venuesById),
    [matches, venuesById],
  );

  const month = MONTHS[monthIndex];
  const canPrev = monthIndex > 0;
  const canNext = monthIndex < MONTHS.length - 1;
  const goPrev = () => canPrev && setMonthIndex((i) => i - 1);
  const goNext = () => canNext && setMonthIndex((i) => i + 1);

  // Touch swipe: a mostly-horizontal flick past the threshold changes month.
  // We use touch events (not pointer events) and never call preventDefault, so
  // taps on the fixtures inside always pass through to their own handlers — a
  // tap has ~0 movement and never trips the threshold.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const agendaDays = useMemo(() => {
    const prefix = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
    return [...byDay.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, dayMatches]) => ({ key, dayMatches }));
  }, [byDay, month]);

  return (
    <div className="flex flex-col gap-4">
      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          aria-label="Previous month"
          className="inline-flex size-9 items-center justify-center rounded-full border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="font-heading text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
          {month.label}
        </h2>
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          aria-label="Next month"
          className="inline-flex size-9 items-center justify-center rounded-full border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* Desktop / tablet: month grid. */}
        <div
          key={`grid-${monthIndex}`}
          className="hidden animate-in fade-in-0 duration-200 md:block"
        >
          <MonthGrid
            year={month.year}
            month={month.month}
            byDay={byDay}
            today={today}
            weather={weather}
          />
        </div>

        {/* Mobile: agenda of this month's match-days. */}
        <div
          key={`agenda-${monthIndex}`}
          className="flex animate-in fade-in-0 flex-col gap-3 duration-200 md:hidden"
        >
          {agendaDays.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No fixtures in {month.label}.
            </p>
          ) : (
            agendaDays.map(({ key, dayMatches }) => (
              <AgendaDay
                key={key}
                dateKey={key}
                dayMatches={dayMatches}
                today={today}
                weather={weather}
              />
            ))
          )}
        </div>
      </div>

      <LegendRow />
    </div>
  );
}

function MonthGrid({
  year,
  month,
  byDay,
  today,
  weather,
}: {
  year: number;
  month: number;
  byDay: Map<string, DayMatch[]>;
  today: string;
  weather: Record<string, MatchWeather>;
}) {
  // getDay() is 0=Sun..6=Sat; shift so Monday is the first column (0=Mon..6=Sun).
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border bg-border">
      {WEEKDAYS.map((wd) => (
        <div
          key={wd}
          className="bg-muted/60 py-2 text-center text-xs font-medium tracking-wide text-muted-foreground"
        >
          {wd}
        </div>
      ))}
      {cells.map((day, i) => {
        if (day === null) {
          // biome-ignore lint/suspicious/noArrayIndexKey: leading blanks are static and never reordered within a fixed month
          return <div key={`blank-${i}`} className="min-h-28 bg-muted/20" />;
        }
        const key = dayKey(year, month, day);
        return (
          <DayCell
            key={key}
            day={day}
            dayMatches={byDay.get(key)}
            isToday={key === today}
            weather={weather}
          />
        );
      })}
    </div>
  );
}

function DayCell({
  day,
  dayMatches,
  isToday,
  weather,
}: {
  day: number;
  dayMatches: DayMatch[] | undefined;
  isToday: boolean;
  weather: Record<string, MatchWeather>;
}) {
  const has = dayMatches && dayMatches.length > 0;
  return (
    <div
      className={cn(
        "flex min-h-28 flex-col gap-1.5 p-1.5 transition-colors lg:min-h-36 lg:p-2",
        has ? "bg-card" : "bg-card/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
            isToday
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {day}
        </span>
        {has ? (
          <span className="text-[0.625rem] font-medium text-muted-foreground">
            {dayMatches.length} {dayMatches.length === 1 ? "match" : "matches"}
          </span>
        ) : null}
      </div>
      {has ? (
        <div className="flex flex-col gap-1">
          {dayMatches.map((dm) => (
            <MatchCell
              key={dm.match.id}
              dayMatch={dm}
              weather={weather[dm.match.id]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A single fixture inside a calendar cell — status, flags, time, weather. */
function MatchCell({
  dayMatch,
  weather,
}: {
  dayMatch: DayMatch;
  weather: MatchWeather | undefined;
}) {
  const router = useRouter();
  const counts = useCounts();
  const { match } = dayMatch;
  const count = counts[match.id] ?? 0;
  const isNorway = match.team1.code === "NOR" || match.team2.code === "NOR";

  return (
    <button
      type="button"
      onClick={() => router.push(`/match/${match.id}`)}
      title={`${match.team1.display} v ${match.team2.display} · ${formatTime(match.kickoffUtc, DISPLAY_TZ)} CEST`}
      className={cn(
        "relative flex w-full flex-col gap-1 rounded-lg border bg-background p-1.5 text-left outline-none transition-colors hover:border-foreground/30 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
        isNorway && "border-red-600/50 ring-1 ring-red-600/40",
      )}
    >
      <HostStatusDot
        matchId={match.id}
        kickoffUtc={match.kickoffUtc}
        className="absolute top-1 right-1 z-10"
      />
      <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 pr-4 text-xs font-semibold leading-tight">
        <TeamFlag team={match.team1} size={18} />
        {match.team1.code}
        <span className="font-normal text-muted-foreground">v</span>
        <TeamFlag team={match.team2} size={18} />
        {match.team2.code}
      </span>
      <div className="flex items-center justify-between gap-1 text-[0.625rem] text-muted-foreground">
        <WeatherInline weather={weather} />
        <time className="shrink-0 tabular-nums">
          {formatTime(match.kickoffUtc, DISPLAY_TZ)}
        </time>
      </div>
      {count > 0 ? (
        <span className="flex items-center gap-1 text-[0.625rem] font-medium text-foreground">
          <Users className="size-3 shrink-0" aria-hidden />
          {count} going
        </span>
      ) : null}
    </button>
  );
}

/** Compact weather: WMO icon + high temp (+ precip hint when notable). */
function WeatherInline({ weather }: { weather: MatchWeather | undefined }) {
  if (!weather) return <span />;
  const { icon, label } = weatherCodeInfo(weather.weatherCode);
  const Icon = icons[icon as keyof typeof icons] ?? icons.CloudOff;
  return (
    <span className="flex min-w-0 items-center gap-1" title={label}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="tabular-nums">{Math.round(weather.tMaxC)}°</span>
      {weather.precipMm >= 1 ? (
        <span className="flex items-center gap-0.5 tabular-nums">
          <Droplets className="size-3 shrink-0" aria-hidden />
          {Math.round(weather.precipMm)}mm
        </span>
      ) : null}
    </span>
  );
}

/** Mobile agenda row: one card per match-day. */
function AgendaDay({
  dateKey,
  dayMatches,
  today,
  weather,
}: {
  dateKey: string;
  dayMatches: DayMatch[];
  today: string;
  weather: Record<string, MatchWeather>;
}) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // date-fns format is deterministic (fixed English locale) — unlike
  // toLocaleDateString(undefined), whose output varies by runtime locale and
  // would mismatch between the server and a non-English browser.
  const heading = format(date, "EEE d MMM");
  const isToday = dateKey === today;

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{heading}</h3>
        {isToday ? (
          <Badge className="h-5 px-1.5 text-[0.625rem]">Today</Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {dayMatches.length} {dayMatches.length === 1 ? "match" : "matches"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {dayMatches.map((dm) => (
          <MatchCell
            key={dm.match.id}
            dayMatch={dm}
            weather={weather[dm.match.id]}
          />
        ))}
      </div>
    </div>
  );
}

function LegendRow() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Each day shows its fixtures with team flags, kickoff time (CEST, Oslo),
      the Oslo weather forecast, and how many friends are going. Swipe or use
      the arrows to change month. Tap a match for full details.
    </p>
  );
}
