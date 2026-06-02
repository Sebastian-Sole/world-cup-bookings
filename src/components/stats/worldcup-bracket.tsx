import { Badge } from "@/components/ui/badge";
import type { WorldCupData } from "@/lib/worldcup-live";
import { WorldCupFixtureRow } from "./worldcup-fixture-row";

interface BracketProps {
  data: WorldCupData;
}

export function WorldCupBracket({ data }: BracketProps) {
  if (data.knockoutByRound.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The knockout bracket appears once the group stage concludes.
      </p>
    );
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-fit gap-4">
        {data.knockoutByRound.map(({ round, matches }) => (
          <section
            key={round}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading text-sm font-medium">{round}</h3>
              <Badge variant="secondary">{matches.length}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {matches.map((match, i) => (
                <WorldCupFixtureRow
                  key={`${match.team1Name}-${match.team2Name}-${i}`}
                  match={match}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
