import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { HostStatusDot } from "@/components/host-status";
import { TeamFlag } from "@/components/team-flag";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DISPLAY_TZ, formatDate, formatTime } from "@/lib/time";
import type { Match, TeamRef, Venue } from "@/lib/types";
import { InterestBadge } from "./interest-badge";

interface MatchCardProps {
  match: Match;
  venue: Venue | undefined;
}

function roundLabel(match: Match): string {
  if (match.stage === "group" && match.group) return `Group ${match.group}`;
  return match.round;
}

/** One team line: flag + full name, with the 3-letter code as a muted suffix. */
function TeamRow({ team }: { team: TeamRef }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamFlag team={team} size={28} />
      <span className="font-medium leading-tight">{team.display}</span>
      {team.resolved ? (
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {team.code}
        </span>
      ) : null}
    </div>
  );
}

export function MatchCard({ match, venue }: MatchCardProps) {
  const unresolved = !match.team1.resolved || !match.team2.resolved;

  return (
    <Link
      href={`/match/${match.id}`}
      className="block rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <Card
        size="sm"
        className="h-full transition-shadow hover:shadow-lg hover:border-foreground/20"
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">{roundLabel(match)}</Badge>
            <div className="flex items-center gap-2">
              {unresolved ? <Badge variant="outline">TBD</Badge> : null}
              <InterestBadge matchId={match.id} hideWhenZero />
              <HostStatusDot matchId={match.id} kickoffUtc={match.kickoffUtc} />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            <TeamRow team={match.team1} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span className="font-medium">vs</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <TeamRow team={match.team2} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0" />
            <span>
              {formatDate(match.kickoffUtc, DISPLAY_TZ)} ·{" "}
              {formatTime(match.kickoffUtc, DISPLAY_TZ)} CEST
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" />
            <span>{venue ? `${venue.name}, ${venue.city}` : "Venue TBD"}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
