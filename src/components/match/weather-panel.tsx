"use client";

import { CloudSun, icons } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MatchWeather } from "@/lib/types";
import { weatherCodeInfo } from "@/lib/weather-codes";

interface WeatherPanelProps {
  matchId: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; weather: MatchWeather };

/** Round to a whole degree for display. */
function celsius(value: number): string {
  return `${Math.round(value)}°C`;
}

export function WeatherPanel({ matchId }: WeatherPanelProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetch(`/api/weather?matchId=${encodeURIComponent(matchId)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
        return res.json() as Promise<MatchWeather>;
      })
      .then((weather) => setState({ status: "ready", weather }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error" });
      });

    return () => controller.abort();
  }, [matchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="size-5 text-muted-foreground" />
          Weather
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state.status === "loading" && <WeatherSkeleton />}
        {state.status === "error" && (
          <p className="text-sm text-muted-foreground">
            Weather is unavailable right now.
          </p>
        )}
        {state.status === "ready" && <WeatherDetails weather={state.weather} />}
      </CardContent>
    </Card>
  );
}

function WeatherSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

function WeatherDetails({ weather }: { weather: MatchWeather }) {
  const { label, icon } = weatherCodeInfo(weather.weatherCode);
  const Icon = icons[icon as keyof typeof icons] ?? icons.CloudOff;

  return (
    <div className="flex flex-col gap-3">
      {weather.source === "normal" && weather.label && (
        <Badge variant="secondary" className="h-auto py-1 whitespace-normal">
          {weather.label}
        </Badge>
      )}

      <div className="flex items-center gap-3">
        <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {celsius(weather.tMaxC)}{" "}
            <span className="text-base font-normal text-muted-foreground">
              / {celsius(weather.tMinC)}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <dt>High / Low</dt>
          <dd className="tabular-nums text-foreground">
            {celsius(weather.tMaxC)} / {celsius(weather.tMinC)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Precipitation</dt>
          <dd className="tabular-nums text-foreground">
            {weather.precipMm.toFixed(1)} mm
          </dd>
        </div>
      </dl>
    </div>
  );
}
