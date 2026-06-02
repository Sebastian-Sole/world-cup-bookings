import { CalendarDays, MapPin } from "lucide-react";
import { TeamFlag } from "@/components/team-flag";
import type { TeamRef } from "@/lib/types";
import type { LiveMatch } from "@/lib/worldcup-live";
import { formatMatchDate, team1Ref, team2Ref } from "./worldcup-helpers";

/** Flag + team name (placeholders render the neutral chip + their label). */
function FixtureTeam({ team }: { team: TeamRef }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <TeamFlag team={team} size={22} />
      <span className="truncate font-medium leading-tight">{team.display}</span>
    </div>
  );
}

interface FixtureRowProps {
  match: LiveMatch;
  /** Round/matchday label shown above the teams. */
  label?: string;
}

/** A compact single-match line for group play and bracket views. */
export function WorldCupFixtureRow({ match, label }: FixtureRowProps) {
  const t1 = team1Ref(match);
  const t2 = team2Ref(match);
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border bg-muted/40 px-3 py-2.5">
      {label ? (
        <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        <FixtureTeam team={t1} />
        {match.played && match.score1 !== null && match.score2 !== null ? (
          <span className="shrink-0 font-heading text-sm font-semibold tabular-nums">
            {match.score1}–{match.score2}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">v</span>
        )}
        <FixtureTeam team={t2} />
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="tabular-nums">{formatMatchDate(match.date)}</span>
        </div>
        {match.ground ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{match.ground}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
