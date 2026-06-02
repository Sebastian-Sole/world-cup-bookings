import { flagSlug, flagUrl } from "@/lib/flags";
import type { TeamRef } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamFlagProps {
  team: TeamRef;
  /** Rendered flag width in pixels. Height follows the 4:3 flag ratio. */
  size?: number;
  className?: string;
}

/**
 * A small, crisp country flag for a team. Resolved teams render the flagcdn
 * image; unresolved knockout placeholders ("Runner-up Group A", "Winner of
 * Match 97") render a neutral monogram chip so every team still has a visual
 * marker of consistent size.
 */
export function TeamFlag({ team, size = 24, className }: TeamFlagProps) {
  const slug = team.resolved ? flagSlug(team.code) : null;
  const height = Math.round((size * 3) / 4);

  if (!slug) {
    return (
      <span
        aria-hidden
        style={{ width: size, height }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[3px] bg-muted text-[0.6rem] font-semibold text-muted-foreground ring-1 ring-border ring-inset",
          className,
        )}
      >
        ?
      </span>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: tiny static flags from a CDN; next/image optimization would add remote-pattern config and an optimizer hop for no real win
    <img
      src={flagUrl(slug, size <= 20 ? 40 : 80)}
      alt={`${team.display} flag`}
      width={size}
      height={height}
      loading="lazy"
      className={cn(
        "shrink-0 rounded-[3px] object-cover ring-1 ring-black/10 ring-inset",
        className,
      )}
    />
  );
}
