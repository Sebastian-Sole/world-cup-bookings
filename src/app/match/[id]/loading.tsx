import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback shown while the detail RSC resolves (notably the
 * Neon-backed `getInterest()` read, which can be slow on a cold start).
 * Mirrors the page layout to avoid a content shift.
 */
export default function MatchLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Skeleton className="mb-6 h-5 w-28" />

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-6 rounded-4xl bg-card p-6 shadow-md ring-1 ring-foreground/5 sm:p-8 dark:ring-foreground/10">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Skeleton className="mx-auto h-7 w-28" />
            <Skeleton className="h-5 w-6" />
            <Skeleton className="mx-auto h-7 w-28" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-56 sm:col-span-2" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-4xl" />
          <Skeleton className="h-48 w-full rounded-4xl" />
        </div>
      </div>
    </main>
  );
}
