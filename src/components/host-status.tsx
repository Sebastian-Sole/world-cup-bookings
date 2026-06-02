"use client";

import {
  Lock,
  LogOut,
  MessageSquarePlus,
  MessageSquareText,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMatchCount } from "@/components/home/counts-provider";
import {
  effectiveStatus,
  HOST_STATUS_LABEL,
  HOST_STATUS_ORDER,
  type HostStatus,
  nextStatus,
  statusOf,
} from "@/lib/host-status";
import { isNightKickoff } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useHostStore } from "@/store/host-store";

/**
 * Default status when the admin hasn't set one: overnight (hidden) matches
 * default to "not hosting", everything else to "available".
 */
function defaultStatusFor(kickoffUtc: string | undefined): HostStatus {
  return kickoffUtc && isNightKickoff(kickoffUtc) ? "blocked" : "available";
}

/** Tailwind dot colour per status. */
const DOT_COLOR: Record<HostStatus, string> = {
  available: "bg-emerald-500",
  limited: "bg-amber-500",
  blocked: "bg-red-500",
};

/** Solid button colour per status (detail-page control). */
const SOLID: Record<HostStatus, string> = {
  available: "bg-emerald-500 text-white ring-emerald-500",
  limited: "bg-amber-500 text-white ring-amber-500",
  blocked: "bg-red-500 text-white ring-red-500",
};

/**
 * Persist a status change to the server, optimistically updating the store and
 * rolling back on failure. Used by the dot (cycle) and the detail control.
 */
async function writeStatus(matchId: string, status: HostStatus) {
  const {
    status: map,
    setStatusLocal,
    clearStatusLocal,
  } = useHostStore.getState();
  const hadExplicit = matchId in map;
  const previous = map[matchId];
  setStatusLocal(matchId, status); // optimistic
  try {
    const res = await fetch("/api/host-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, status }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    // Revert: restore the prior explicit value, or drop back to the computed
    // default if there wasn't one.
    if (hadExplicit) setStatusLocal(matchId, previous);
    else clearStatusLocal(matchId);
    toast.error("Couldn't save hosting status. Check your connection / login.");
  }
}

/**
 * Coloured availability dot for a match. Read-only for everyone; for an
 * authenticated admin it becomes a clickable control that cycles
 * available → limited → blocked.
 *
 * Rendered as a <span> (not <button>) so it can live inside the card/cell
 * <button>/<a> without invalid nesting; in admin mode it gets role="button" +
 * keyboard handlers and stops propagation so it never triggers navigation.
 */
export function HostStatusDot({
  matchId,
  kickoffUtc,
  className,
}: {
  matchId: string;
  kickoffUtc?: string;
  className?: string;
}) {
  const fallback = defaultStatusFor(kickoffUtc);
  const base = useHostStore((s) => statusOf(s.status, matchId, fallback));
  const comment = useHostStore((s) => s.comments[matchId] ?? "");
  const isAdmin = useHostStore((s) => s.isAdmin);
  const interest = useMatchCount(matchId);

  // Interest auto-upgrades available → limited at the threshold (blocked wins).
  const status = effectiveStatus(base, interest);

  // One dot per game. A note (blue) overrides the hosting-status colour.
  const hasNote = comment.length > 0;
  const label = hasNote
    ? `Note: ${comment}`
    : `Hosting: ${HOST_STATUS_LABEL[status]}${status === "limited" && base !== "limited" ? ` (${interest} interested)` : ""}`;

  const dot = (
    <span
      className={cn(
        "block size-2.5 rounded-full ring-2 ring-background",
        hasNote ? "bg-blue-500" : DOT_COLOR[status],
      )}
    />
  );

  if (!isAdmin) {
    return (
      <span
        role="img"
        title={label}
        aria-label={label}
        className={cn("inline-flex shrink-0 items-center", className)}
      >
        {dot}
      </span>
    );
  }

  // Admin clicks edit the explicit setting, so cycle from the stored base.
  const cycle = () => writeStatus(matchId, nextStatus(base));

  return (
    // biome-ignore lint/a11y/useSemanticElements: must be a <span> — this control lives inside the card's <button>/<a>, where a nested <button> is invalid HTML
    <span
      role="button"
      tabIndex={0}
      title={`${label} — click to change`}
      aria-label={`Hosting status: ${label}. Activate to change.`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cycle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          cycle();
        }
      }}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-full p-1 outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      {dot}
    </span>
  );
}

/**
 * Admin control: shows a Logout pill when logged in, an "Admin" button that
 * reveals a password field otherwise. Hidden entirely if admin isn't
 * configured on the server (no ADMIN_PASSWORD) or before the session check.
 */
export function AdminControl() {
  const ready = useHostStore((s) => s.ready);
  const isAdmin = useHostStore((s) => s.isAdmin);
  const configured = useHostStore((s) => s.adminConfigured);
  const setIsAdmin = useHostStore((s) => s.setIsAdmin);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the password field once when the login form opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!ready || !configured) return null;

  if (isAdmin) {
    return (
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/admin/logout", { method: "POST" });
          setIsAdmin(false);
          toast.success("Signed out of admin.");
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors"
      >
        <span className="size-2 rounded-full bg-emerald-400" />
        Admin on
        <LogOut className="size-3.5" />
      </button>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setIsAdmin(true);
        setOpen(false);
        setPassword("");
        toast.success("Admin unlocked.");
      } else {
        toast.error("Incorrect password.");
      }
    } catch {
      toast.error("Login failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <Lock className="size-3.5" />
        Admin
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        aria-label="Admin password"
        className="h-9 w-44 rounded-full border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-9 items-center rounded-full bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
      >
        Unlock
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setPassword("");
        }}
        className="inline-flex h-9 items-center rounded-full px-2 text-sm text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </form>
  );
}

/** Compact legend explaining the three status colours. */
export function HostLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      {HOST_STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", DOT_COLOR[s])} />
          {HOST_STATUS_LABEL[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-blue-500" />
        Has a note
      </span>
    </div>
  );
}

/**
 * Detail-page status control. Admins get a segmented control that writes to the
 * server; everyone else sees a read-only line with the current status.
 */
export function HostStatusControl({
  matchId,
  kickoffUtc,
  interestCount = 0,
}: {
  matchId: string;
  kickoffUtc?: string;
  interestCount?: number;
}) {
  const fallback = defaultStatusFor(kickoffUtc);
  const base = useHostStore((s) => statusOf(s.status, matchId, fallback));
  const isAdmin = useHostStore((s) => s.isAdmin);
  const status = effectiveStatus(base, interestCount);

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={cn("size-2.5 rounded-full", DOT_COLOR[status])} />
        <span className="font-medium">Hosting status:</span>
        <span className="text-muted-foreground">
          {HOST_STATUS_LABEL[status]}
          {status === "limited" && base !== "limited"
            ? ` (${interestCount} interested)`
            : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Are you hosting this one?</span>
      <div className="flex flex-wrap gap-2">
        {HOST_STATUS_ORDER.map((s) => {
          // Highlight the explicit setting (base); "limited" may also be
          // auto-applied by interest, but the control edits the real value.
          const active = base === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => writeStatus(matchId, s)}
              aria-pressed={active}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors",
                active
                  ? SOLID[s]
                  : "text-muted-foreground ring-border hover:bg-muted",
              )}
            >
              {HOST_STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      {status === "limited" && base !== "limited" ? (
        <p className="text-xs text-muted-foreground">
          Auto-marked limited — {interestCount} interested.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Persist a comment change to the server, optimistically updating the store and
 * rolling back on failure.
 */
async function writeComment(matchId: string, comment: string) {
  const { comments, setCommentLocal } = useHostStore.getState();
  const previous = comments[matchId] ?? "";
  setCommentLocal(matchId, comment); // optimistic
  try {
    const res = await fetch("/api/host-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, comment }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    setCommentLocal(matchId, previous);
    toast.error("Couldn't save the note. Check your connection / login.");
  }
}

const COMMENT_MAX = 280;

/**
 * Detail-page note for a match. Everyone sees the note (e.g. "Watching at
 * O'Learys", "Erik is hosting"); admins get an inline editor to add/edit/clear
 * it. Renders nothing for non-admins when there's no note.
 */
export function HostComment({ matchId }: { matchId: string }) {
  const comment = useHostStore((s) => s.comments[matchId] ?? "");
  const isAdmin = useHostStore((s) => s.isAdmin);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment);

  // Keep the draft in sync with the stored value while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(comment);
  }, [comment, editing]);

  // Non-admin: show the note if present, otherwise nothing.
  if (!isAdmin) {
    if (!comment) return null;
    return (
      <div className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="whitespace-pre-wrap">{comment}</p>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {comment ? (
          <div className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="whitespace-pre-wrap">{comment}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setDraft(comment);
            setEditing(true);
          }}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <MessageSquarePlus className="size-4" />
          {comment ? "Edit note" : "Add a note"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        writeComment(matchId, draft);
        setEditing(false);
      }}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={2}
        placeholder="e.g. Watching at O'Learys · Erik is hosting · bring snacks"
        className="w-full resize-none rounded-2xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Save note
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(comment);
            setEditing(false);
          }}
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {comment ? (
          <button
            type="button"
            onClick={() => {
              writeComment(matchId, "");
              setEditing(false);
            }}
            className="ml-auto rounded-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}
