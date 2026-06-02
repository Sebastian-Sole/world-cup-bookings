import { TeamFlag } from "@/components/team-flag";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GroupRow, WorldCupData } from "@/lib/worldcup-live";
import { rowRef } from "./worldcup-helpers";

interface StandingsProps {
  data: WorldCupData;
}

const STAT_COLS = [
  ["P", (r: GroupRow) => r.played],
  ["W", (r: GroupRow) => r.won],
  ["D", (r: GroupRow) => r.drawn],
  ["L", (r: GroupRow) => r.lost],
  ["GF", (r: GroupRow) => r.gf],
  ["GA", (r: GroupRow) => r.ga],
  ["GD", (r: GroupRow) => (r.gd > 0 ? `+${r.gd}` : r.gd)],
  ["Pts", (r: GroupRow) => r.points],
] as const;

export function WorldCupStandings({ data }: StandingsProps) {
  const { groupStandings, played, total } = data;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {played} of {total} matches played
        {played === 0 ? " — standings update as matches are played" : null}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupStandings.map(({ group, rows }) => (
          <Card key={group} size="sm">
            <CardHeader>
              <CardTitle>Group {group}</CardTitle>
            </CardHeader>
            <div className="px-4">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 pr-1 text-left font-medium">#</th>
                    <th className="py-1.5 pr-1 text-left font-medium">Team</th>
                    {STAT_COLS.map(([col]) => (
                      <th
                        key={col}
                        className="py-1.5 pl-1 text-right font-medium"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const advances = i < 2;
                    return (
                      <tr key={row.name} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-1">
                          <span
                            className={cn(
                              "tabular-nums",
                              advances
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                            )}
                            title={advances ? "Advances" : undefined}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-1.5 pr-1">
                          <div className="flex items-center gap-2">
                            <TeamFlag team={rowRef(row)} size={20} />
                            <span className="truncate font-medium">
                              {row.name}
                            </span>
                          </div>
                        </td>
                        {STAT_COLS.map(([col, get]) => (
                          <td
                            key={col}
                            className={cn(
                              "py-1.5 pl-1 text-right",
                              col === "Pts"
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {get(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
