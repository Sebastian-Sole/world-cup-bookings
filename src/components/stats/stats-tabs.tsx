"use client";

import { Beer, Trophy, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { PlayerTab } from "@/components/stats/player-tab";
import { UsTab } from "@/components/stats/us-tab";
import { WorldCupTab } from "@/components/stats/world-cup-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UsStat } from "@/lib/stats";
import type { WorldCupData } from "@/lib/worldcup-live";

type StatsTab = "worldcup" | "player" | "us";

interface StatsTabsProps {
  worldCup: WorldCupData;
  usStats: UsStat[];
  isAdmin: boolean;
}

function normalizeTab(value: string | null): StatsTab {
  if (value === "player") return "player";
  if (value === "us") return "us";
  return "worldcup";
}

export function StatsTabs({ worldCup, usStats, isAdmin }: StatsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const onValueChange = useCallback(
    (next: unknown) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", String(next));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <Tabs value={tab} onValueChange={onValueChange} className="gap-5">
      <TabsList>
        <TabsTrigger value="worldcup">
          <Trophy />
          World Cup
        </TabsTrigger>
        <TabsTrigger value="player">
          <Users />
          Player
        </TabsTrigger>
        <TabsTrigger value="us">
          <Beer />
          Us
        </TabsTrigger>
      </TabsList>
      <TabsContent value="worldcup">
        <WorldCupTab data={worldCup} />
      </TabsContent>
      <TabsContent value="player">
        <PlayerTab scorers={worldCup.topScorers} />
      </TabsContent>
      <TabsContent value="us">
        <UsTab stats={usStats} isAdmin={isAdmin} />
      </TabsContent>
    </Tabs>
  );
}
