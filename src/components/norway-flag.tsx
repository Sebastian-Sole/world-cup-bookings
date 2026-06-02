import { flagUrl } from "@/lib/flags";
import type { Match } from "@/lib/types";
import { cn } from "@/lib/utils";

/** True when either side of a fixture is Norway (the home crowd's team). */
export function isNorwayMatch(match: Match): boolean {
  return match.team1.code === "NOR" || match.team2.code === "NOR";
}

/**
 * A faint full-bleed Norwegian-flag wash for Norway fixtures. Rendered as an
 * absolutely-positioned layer, so the host must be `relative overflow-hidden`
 * and the foreground content `relative` (positioned, later in the DOM) to stay
 * legible on top. Opacity is kept low enough that text reads cleanly in both
 * themes; a red ring on the card carries the rest of the "this is Norway" cue.
 */
export function NorwayFlagWash({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {/* biome-ignore lint/performance/noImgElement: tiny static flag from a CDN; next/image optimization would add remote-pattern config and an optimizer hop for no real win */}
      <img
        src={flagUrl("no", 160)}
        alt=""
        className="size-full object-cover opacity-[0.09] dark:opacity-[0.16]"
      />
    </div>
  );
}

/** Red ring marking a Norway fixture's card (pairs with NorwayFlagWash). */
export const NORWAY_RING = "ring-2 ring-red-600/60 dark:ring-red-500/55";
