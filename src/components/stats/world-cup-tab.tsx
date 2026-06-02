"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorldCupData } from "@/lib/worldcup-live";
import { WorldCupBracket } from "./worldcup-bracket";
import { WorldCupGroups } from "./worldcup-groups";
import { WorldCupStandings } from "./worldcup-standings";
import { WorldCupTeams } from "./worldcup-teams";

export interface WorldCupTabProps {
  data: WorldCupData;
}

type View = "standings" | "groups" | "bracket" | "teams";

export function WorldCupTab({ data }: WorldCupTabProps) {
  const [view, setView] = useState<View>("standings");

  return (
    <Tabs
      value={view}
      onValueChange={(next) => setView(next as View)}
      className="gap-5"
    >
      <TabsList>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="groups">Groups</TabsTrigger>
        <TabsTrigger value="bracket">Bracket</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
      </TabsList>
      <TabsContent value="standings">
        <WorldCupStandings data={data} />
      </TabsContent>
      <TabsContent value="groups">
        <WorldCupGroups data={data} />
      </TabsContent>
      <TabsContent value="bracket">
        <WorldCupBracket data={data} />
      </TabsContent>
      <TabsContent value="teams">
        <WorldCupTeams data={data} />
      </TabsContent>
    </Tabs>
  );
}
