import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center sm:px-6">
      <p className="font-heading text-sm font-medium tracking-widest text-muted-foreground uppercase">
        404
      </p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        We couldn&apos;t find that match
      </h1>
      <p className="max-w-md text-muted-foreground">
        The fixture you&apos;re looking for doesn&apos;t exist, or its link may
        have changed. Browse the full schedule to find your match.
      </p>
      <Button render={<Link href="/" />} className="mt-2">
        Back to all matches
      </Button>
    </main>
  );
}
