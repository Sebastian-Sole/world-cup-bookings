import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorldCupData } from "@/lib/worldcup-live";
import { WorldCupFixtureRow } from "./worldcup-fixture-row";

interface GroupsProps {
  data: WorldCupData;
}

export function WorldCupGroups({ data }: GroupsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.groupMatches.map(({ group, matches }) => (
        <Card key={group} size="sm">
          <CardHeader>
            <CardTitle>Group {group}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {matches.map((match, i) => (
              <WorldCupFixtureRow
                key={`${match.team1Name}-${match.team2Name}-${i}`}
                match={match}
                label={match.round}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
