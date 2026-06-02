import { TeamFlag } from "@/components/team-flag";
import type { GroupRow, WorldCupData } from "@/lib/worldcup-live";
import { rowRef } from "./worldcup-helpers";

interface TeamsProps {
  data: WorldCupData;
}

interface TeamEntry {
  row: GroupRow;
  group: string;
}

export function WorldCupTeams({ data }: TeamsProps) {
  const teams: TeamEntry[] = data.groupStandings
    .flatMap(({ group, rows }) => rows.map((row) => ({ row, group })))
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.row.name.localeCompare(b.row.name),
    );

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Teams appear here once the tournament feed is available.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {teams.map(({ row, group }) => (
        <div
          key={`${group}-${row.name}`}
          className="flex items-center gap-3 rounded-2xl border bg-card p-3"
        >
          <TeamFlag team={rowRef(row)} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium leading-tight">
              {row.name}
            </span>
            <span className="text-xs text-muted-foreground">Group {group}</span>
            <span className="mt-0.5 text-[0.7rem] text-muted-foreground tabular-nums">
              P{row.played} · W{row.won} · {row.gf}–{row.ga}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
