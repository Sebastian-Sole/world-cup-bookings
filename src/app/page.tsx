import { Suspense } from "react";
import { HomeTabs } from "@/components/home/home-tabs";
import { TodaysMatches } from "@/components/home/todays-matches";
import { HostProvider } from "@/components/host-provider";
import { getHostState, type HostState } from "@/lib/host";
import { getCounts } from "@/lib/interest";
import {
  getAllMatches,
  getAllVenues,
  getGroups,
  getKnockoutRounds,
} from "@/lib/matches";
import type { InterestCounts, MatchWeather } from "@/lib/types";
import { getWeatherForMatches } from "@/lib/weather";

export default async function Home() {
  const matches = getAllMatches();
  const venues = getAllVenues();
  const groups = getGroups();
  const knockoutRounds = getKnockoutRounds();

  // Seed interest counts server-side. Guard so a missing/unreachable DB (e.g.
  // local dev or build before Neon is provisioned) degrades to {} rather than
  // crashing the page or build — mirrors the detail page's getInterest guard.
  let initialCounts: InterestCounts = {};
  try {
    initialCounts = await getCounts();
  } catch {
    // No DATABASE_URL yet, or DB unreachable — render with empty counts.
  }

  // Resolve Oslo weather for every match so the calendar squares can show it
  // without a per-match round-trip. In-horizon dates share one cached forecast
  // fetch; the rest are instant climate-normal lookups. Never let weather
  // failures break the page.
  let weather: Record<string, MatchWeather> = {};
  try {
    weather = await getWeatherForMatches(matches);
  } catch {
    // Open-Meteo unreachable — render the calendar without weather chips.
  }

  // Seed hosting status + comments server-side (degrades to empty without a DB).
  let hostState: HostState = { status: {}, comments: {} };
  try {
    hostState = await getHostState();
  } catch {
    // No DATABASE_URL yet — render with defaults (all "available", no notes).
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          🇳🇴 TMG23A World Cup 2026 🇳🇴
        </h1>
        <p className="text-muted-foreground">Heeeelvete vi skal til VM!!</p>
      </div>
      <HostProvider
        initialStatus={hostState.status}
        initialComments={hostState.comments}
      >
        <TodaysMatches matches={matches} venues={venues} weather={weather} />
        <Suspense>
          <HomeTabs
            matches={matches}
            venues={venues}
            groups={groups}
            knockoutRounds={knockoutRounds}
            initialCounts={initialCounts}
            weather={weather}
          />
        </Suspense>
      </HostProvider>
    </main>
  );
}
