"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { InterestResponse } from "@/lib/types";
import { useInterestStore } from "@/store/interest-store";

interface RsvpPanelProps {
  matchId: string;
  initialNames: string[];
  initialCount: number;
}

// Client-side form schema. Mirrors `nameSchema`'s constraints but WITHOUT the
// trim/collapse `.transform()` — a transforming schema makes the resolver's
// input and output types diverge and trips @hookform/resolvers' zod overloads.
// The server re-validates with `nameSchema` (the source of truth) and applies
// the canonical normalization.
const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name")
    .max(40, "Name must be 40 characters or fewer")
    .regex(/^[\p{L}\p{M}\p{N} .'-]+$/u, "Use letters, spaces, . ' or -"),
});
type FormValues = z.infer<typeof formSchema>;

/** Initials for an avatar fallback: first letter of up to the first two words. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

export function RsvpPanel({
  matchId,
  initialNames,
  initialCount,
}: RsvpPanelProps) {
  // Server truth lives in local state, refreshed from POST responses.
  const [names, setNames] = useState<string[]>(initialNames);
  const [count, setCount] = useState<number>(initialCount);

  const optimisticEntry = useInterestStore((s) => s.optimistic[matchId]);
  const submittedStored = useInterestStore((s) =>
    Boolean(s.submittedMatches[matchId]),
  );
  // `submittedMatches` is persisted to localStorage, which the zustand store
  // rehydrates on the client before first paint — so reading it during the
  // initial render would mismatch the server (which has no localStorage). Gate
  // it behind a mount flag: server + first client render both show "not
  // submitted", then it reflects the real value after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const submitted = mounted && submittedStored;
  const applyOptimistic = useInterestStore((s) => s.applyOptimistic);
  const reconcile = useInterestStore((s) => s.reconcile);
  const rollback = useInterestStore((s) => s.rollback);
  const markSubmitted = useInterestStore((s) => s.markSubmitted);

  const form = useForm<FormValues>({
    // standardSchemaResolver (not zodResolver) sidesteps a zod-4 internal type
    // brand mismatch in @hookform/resolvers@5.4.0 under pnpm; zod 4 implements
    // the Standard Schema spec, so this is the version-agnostic path.
    resolver: standardSchemaResolver(formSchema),
    defaultValues: { name: "" },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  // Display = server names + any still-pending optimistic names.
  const displayNames = [...names, ...(optimisticEntry?.names ?? [])];
  const displayCount = count + (optimisticEntry?.delta ?? 0);

  async function onSubmit(values: FormValues) {
    const name = values.name;
    applyOptimistic(matchId, name);

    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, name }),
      });

      if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);

      const data = (await res.json()) as InterestResponse;

      // Adopt server truth, then clear the optimistic delta (avoids double-count).
      setNames(data.names);
      setCount(data.count);
      reconcile(matchId, data.names, data.count);
      markSubmitted(matchId);
      reset({ name: "" });

      if (data.deduped) {
        toast.info("You were already on the list");
      } else {
        toast.success("You're in!");
      }
    } catch {
      rollback(matchId);
      toast.error("Couldn't save your RSVP. Please try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          Who&apos;s in?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {submitted ? (
          <Button type="button" disabled className="w-full">
            You&apos;re in
          </Button>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-3"
            noValidate
          >
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="rsvp-name">Your name</FieldLabel>
              <Input
                id="rsvp-name"
                placeholder="e.g. Sam R."
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
              <FieldError errors={errors.name ? [errors.name] : undefined} />
            </Field>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Adding…" : "I'm watching"}
            </Button>
          </form>
        )}

        <AttendeeList names={displayNames} count={displayCount} />
      </CardContent>
    </Card>
  );
}

function AttendeeList({ names, count }: { names: string[]; count: number }) {
  if (names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Be the first to RSVP.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Watching</span>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {names.map((name, i) => (
          // Append-only, stably-ordered list (created_at asc + optimistic
          // appended last); names may repeat, so index keeps keys unique.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable append-only order
          <li key={`${name}-${i}`} className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="text-sm">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
