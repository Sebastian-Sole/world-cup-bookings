"use client";

import { CalendarDays, Eye, EyeOff, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminControl, HostLegend } from "@/components/host-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isNightKickoff } from "@/lib/time";
import type { InterestCounts, Match, MatchWeather, Venue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarView } from "./calendar-view";
import { CountsProvider } from "./counts-provider";
import { ListView } from "./list-view";

type View = "calendar" | "list";

interface HomeTabsProps {
  matches: Match[];
  venues: Venue[];
  groups: string[];
  knockoutRounds: string[];
  initialCounts: InterestCounts;
  weather: Record<string, MatchWeather>;
}

function normalizeView(value: string | null): View {
  return value === "list" ? "list" : "calendar";
}

export function HomeTabs({
  matches,
  venues,
  groups,
  knockoutRounds,
  initialCounts,
  weather,
}: HomeTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = normalizeView(searchParams.get("view"));

  // Remember the active view so the match detail page's "All matches" link can
  // return here instead of always defaulting to the list.
  useEffect(() => {
    try {
      localStorage.setItem("wc26-view", view);
    } catch {
      // localStorage unavailable (private mode) — back link falls back to calendar
    }
  }, [view]);

  // Hide overnight kickoffs (Oslo 12am–8am) by default; "View hidden" reveals
  // them. State is per-session (off on every visit, as requested).
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = useMemo(
    () => matches.filter((m) => isNightKickoff(m.kickoffUtc)).length,
    [matches],
  );
  const visibleMatches = useMemo(
    () =>
      showHidden
        ? matches
        : matches.filter((m) => !isNightKickoff(m.kickoffUtc)),
    [matches, showHidden],
  );

  const onValueChange = useCallback(
    (next: unknown) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", String(next));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    // One poller for the whole home page; both tabs read counts from context.
    <CountsProvider initialCounts={initialCounts}>
      <Tabs value={view} onValueChange={onValueChange} className="gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarDays />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="list">
              <List />
              List
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                aria-pressed={showHidden}
                title="Overnight kickoffs (Oslo 12am–8am) are hidden by default"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  showHidden
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {showHidden ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
                View hidden ({hiddenCount})
              </button>
            ) : null}
            <AdminControl />
          </div>
        </div>
        <HostLegend className="justify-center sm:justify-start" />
        <TabsContent value="calendar">
          <CalendarView
            matches={visibleMatches}
            venues={venues}
            weather={weather}
          />
        </TabsContent>
        <TabsContent value="list">
          <ListView
            matches={visibleMatches}
            venues={venues}
            groups={groups}
            knockoutRounds={knockoutRounds}
          />
        </TabsContent>
      </Tabs>
    </CountsProvider>
  );
}
