import { CalendarDays, Clock, MapPin } from "lucide-react";
import {
  isNorwayMatch,
  NORWAY_RING,
  NorwayFlagWash,
} from "@/components/norway-flag";
import { TeamFlag } from "@/components/team-flag";
import { Badge } from "@/components/ui/badge";
import type { MatchResult } from "@/lib/scores";
import {
  DISPLAY_TZ,
  DISPLAY_TZ_LABEL,
  formatDate,
  formatTime,
} from "@/lib/time";
import type { Match, TeamRef, Venue } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MatchHeroProps {
  match: Match;
  venue: Venue | undefined;
  result?: MatchResult | null;
}

function TeamName({ team }: { team: TeamRef }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamFlag
        team={team}
        size={56}
        className="rounded-md shadow-sm ring-black/10"
      />
      <span className="text-xl font-semibold sm:text-2xl">{team.display}</span>
      {team.resolved ? null : <Badge variant="outline">TBD</Badge>}
    </div>
  );
}

export function MatchHero({ match, venue, result }: MatchHeroProps) {
  const roundLabel =
    match.stage === "group" && match.group
      ? `Group ${match.group}`
      : match.round;

  return (
    <section
      className={cn(
        "relative flex flex-col gap-6 overflow-hidden rounded-4xl bg-card p-6 shadow-md ring-1 ring-foreground/5 sm:p-8 dark:ring-foreground/10",
        isNorwayMatch(match) && NORWAY_RING,
      )}
    >
      {isNorwayMatch(match) ? <NorwayFlagWash /> : null}
      <div className="relative flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{roundLabel}</Badge>
        {roundLabel !== match.round ? (
          <Badge variant="ghost">{match.round}</Badge>
        ) : null}
        {result ? (
          <Badge variant={result.completed ? "outline" : "default"}>
            {result.completed ? "Full time" : "Live"}
          </Badge>
        ) : null}
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <TeamName team={match.team1} />
        {result ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-heading text-3xl font-bold tabular-nums sm:text-4xl">
              {result.score1}
              <span className="mx-1.5 text-muted-foreground">–</span>
              {result.score2}
            </span>
            {result.completed ? null : (
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                in play
              </span>
            )}
          </div>
        ) : (
          <span className="text-lg font-medium text-muted-foreground">vs</span>
        )}
        <TeamName team={match.team2} />
      </div>

      <dl className="relative grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <dd>{formatDate(match.kickoffUtc, DISPLAY_TZ)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <dd>{venue ? `${venue.name}, ${venue.city}` : "Venue TBD"}</dd>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dd>
            {formatTime(match.kickoffUtc, DISPLAY_TZ)}
            <span className="ml-1 text-muted-foreground">
              {DISPLAY_TZ_LABEL} (Oslo)
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
