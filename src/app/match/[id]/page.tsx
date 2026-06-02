import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostProvider } from "@/components/host-provider";
import { HostComment, HostStatusControl } from "@/components/host-status";
import { BackToMatches } from "@/components/match/back-to-matches";
import { MatchHero } from "@/components/match/match-hero";
import { RsvpPanel } from "@/components/match/rsvp-panel";
import { WeatherPanel } from "@/components/match/weather-panel";
import { getHostState, type HostState } from "@/lib/host";
import { getInterest } from "@/lib/interest";
import { getMatchById, getVenue } from "@/lib/matches";
import type { InterestResponse } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const match = getMatchById(id);
  if (!match) return { title: "Match not found" };
  return {
    title: `${match.team1.display} v ${match.team2.display}`,
  };
}

export default async function MatchPage({ params }: PageProps) {
  const { id } = await params;
  const match = getMatchById(id);
  if (!match) notFound();

  const venue = getVenue(match.venueId);

  // Read initial interest server-side. Guard so a missing/unreachable DB (e.g.
  // local dev before Neon is provisioned) degrades to an empty list rather than
  // crashing the page.
  let initial: InterestResponse = { matchId: match.id, count: 0, names: [] };
  try {
    initial = await getInterest(match.id);
  } catch {
    // No DATABASE_URL yet, or DB unreachable — render with empty interest.
  }

  let hostState: HostState = { status: {}, comments: {} };
  try {
    hostState = await getHostState();
  } catch {
    // No DATABASE_URL yet — default (all "available", no notes).
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <BackToMatches />

      <HostProvider
        initialStatus={hostState.status}
        initialComments={hostState.comments}
      >
        <div className="flex flex-col gap-6">
          <MatchHero match={match} venue={venue} />
          <div className="flex flex-col gap-4 rounded-4xl border bg-card p-5 shadow-sm">
            <HostStatusControl
              matchId={match.id}
              kickoffUtc={match.kickoffUtc}
            />
            <HostComment matchId={match.id} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <WeatherPanel matchId={match.id} />
            <RsvpPanel
              matchId={match.id}
              initialNames={initial.names}
              initialCount={initial.count}
            />
          </div>
        </div>
      </HostProvider>
    </main>
  );
}
