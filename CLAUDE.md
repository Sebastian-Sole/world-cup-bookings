# CLAUDE.md

Guidance for working in this repo. Keep changes consistent with the conventions below.

## What this is

A private World Cup 2026 viewing-party planner for a friend group ("TMG23A", based in Oslo). Browse fixtures, RSVP to matches, see weather, and track live tournament + group stats. Deployed on Vercel (free tier).

## Commands

```bash
pnpm dev                      # Next dev server (Turbopack)
pnpm build                    # production build (run before declaring done on big changes)
pnpm lint                     # Biome check (lint + format check)
pnpm format                   # Biome format --write
pnpm tsx scripts/migrate.ts   # idempotent Neon migration (auto-loads .env.local)
pnpm tsx scripts/prepare-data.ts  # regenerate matches.json + climate-normals.json from openfootball/Open-Meteo (run manually, then commit output)
```

Always finish a change with `npx tsc --noEmit` and `npx biome check --write src/` both clean.

## Stack

Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4 (monochrome theme in `globals.css`), Base UI shadcn components (`src/components/ui`), Zustand, Neon serverless Postgres, date-fns + `@date-fns/tz`, Biome, Sonner. Path alias `@/` → `src/`.

## Architecture & data sources

Three independent data sources, no shared runtime coupling (see `BUILD_PLAN.md` for the original design):

- **Static, committed** — `src/data/{matches,venues,climate-normals}.json`. **Fixtures only: no scores, goals, or player data.** Imported directly into Server Components (no fetch/DB). Read via `src/lib/matches.ts`.
- **Live, external** —
  - **Weather:** Open-Meteo, server-side only in `src/lib/weather.ts` (forecast within ~16 days, else committed climate normals). **Weather is always for Oslo** (where they watch), not the venue.
  - **Stats:** openfootball `worldcup.json` (public-domain, keyless) in `src/lib/worldcup-live.ts` — live standings, top scorers, knockout fixtures, cached `next: { revalidate: 600 }`. Empty until matches are played (June 11 2026+).
- **Shared mutable state** — Neon via the `@neondatabase/serverless` HTTP driver. Tables: `rsvps`, `host_status` (+`comment`), `us_stats`. Accessed in `src/lib/{interest,host,stats}.ts`.

### Routes
- `/` — calendar + list views (`src/components/home/*`)
- `/match/[id]` — match detail (`src/components/match/*`)
- `/stats` — World Cup / Player / Us tabs (`src/components/stats/*`)
- `src/app/api/*` — `interest`, `interest/counts`, `weather`, `host-status`, `host-comment`, `us-stats`, `admin/{login,logout,session}`. All set `export const runtime = "nodejs"`.

## Conventions (follow these)

- **Time zone:** all user-facing times render in **Oslo/CEST** via `DISPLAY_TZ` in `src/lib/time.ts`. Use the date-fns helpers there (`formatTime`, `formatDate`, `formatInTz`, `localDateString`, `isNightKickoff`). **Never** `toLocaleDateString(undefined, …)` or `new Date()` in render — they vary by locale/clock and cause hydration mismatches (see below).
- **Flags:** `src/lib/flags.ts` maps ISO3 team codes → flagcdn slugs; render with `<TeamFlag team={teamRef} />`. Unknown/placeholder teams get a neutral chip.
- **Neon SQL:** use the tagged-template `sql` from `src/lib/db.ts` — `sql\`... ${val} ...\`` binds params. **Never** `$1` placeholders. `db.ts` constructs the client lazily, so it never crashes when `DATABASE_URL` is unset. Read functions may throw; **callers guard with try/catch and fall back to safe defaults** ({} / []), so the app renders before Neon is provisioned.
- **Admin auth (`src/lib/admin.ts`):** a single shared password in the `ADMIN_PASSWORD` env var, checked **server-side only** (never shipped to the client bundle). `POST /api/admin/login` sets a signed, httpOnly cookie; `isAdminRequest()` verifies it in RSCs and admin-gated routes (which `401` otherwise). The stats RSC reads `isAdmin` server-side and passes it down.
- **Hydration safety:** client components that depend on the clock, locale, or a persisted store must render a server-stable value first and resolve after mount (`useEffect` + a `mounted`/`today` flag). Examples: `calendar-view.tsx` (today/month), `todays-matches.tsx`, `rsvp-panel.tsx` (`submittedMatches` from the persisted store), `host-provider.tsx`.
- **State:** `src/store/host-store.ts` (server-seeded, NOT persisted) and `src/store/interest-store.ts` (persists only `submittedMatches`). Source of truth for shared data is always the server (Neon); stores hold optimistic/UI state.
- **Hosting-status dot:** one dot per match — a blue "has a note" dot overrides the green/yellow/red status; overnight games default to "not hosting".

## Environment (`.env.local`, gitignored)

```
DATABASE_URL=postgresql://…   # Neon (Vercel integration auto-injects it in prod)
ADMIN_PASSWORD=…              # enables admin mode
ADMIN_SESSION_SECRET=…        # optional; falls back to ADMIN_PASSWORD for HMAC
```
After provisioning Neon: `pnpm tsx scripts/migrate.ts`. Set `ADMIN_PASSWORD` (+ optional secret) in Vercel env for production.

## Gotchas

- **Mobile LAN testing:** Next 16 blocks dev assets from non-localhost origins → the page loads but never hydrates (dead buttons). `next.config.ts` lists `allowedDevOrigins` (LAN IP / hostname); these are **dev-only**, no prod effect. Add your machine's LAN IP/host if it changes.
- Restart `pnpm dev` after editing `next.config.ts` or `.env.local`.
- `scripts/*` run under `tsx`, which does **not** resolve the `@/` path alias — keep scripts on relative/package imports (migrate.ts loads `.env.local` itself via `process.loadEnvFile`).
- The 2026 fixtures have no results yet; stats/standings are empty until the tournament starts and openfootball volunteers post scores (which can lag a match by hours).
