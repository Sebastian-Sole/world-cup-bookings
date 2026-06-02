"use client";

import { Check, Copy, Pencil } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * One device identity, set once and reused everywhere (RSVP + predictions).
 * Trust-based, no login: `{ id, name, code }` in localStorage (`wc26-player`),
 * id is client-generated. A required name gate blocks the site until a name is
 * set OR an existing identity is linked via its sync code (so one person can
 * use the same identity across devices). Editable from the header chip.
 */

const STORAGE_KEY = "wc26-player";
const NAME_RE = /^[\p{L}\p{M}\p{N} .'-]+$/u;

export interface Identity {
  id: string;
  name: string;
  code: string; // shareable sync code (may be "" until the server assigns it)
}

interface IdentityContextValue {
  player: Identity | null;
  ready: boolean;
  save: (name: string) => void;
  /** Link an existing identity by sync code. Returns true on success. */
  link: (code: string) => Promise<boolean>;
}

const IdentityContext = createContext<IdentityContextValue>({
  player: null,
  ready: false,
  save: () => {},
  link: async () => false,
});

export function useIdentity(): IdentityContextValue {
  return useContext(IdentityContext);
}

/** True if a name is acceptable (mirrors the server `nameSchema`). */
export function isValidName(raw: string): boolean {
  const n = raw.trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 40 && NAME_RE.test(n);
}

function persist(next: Identity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  // After creating a brand-new identity, show the sync code once so the user
  // saves it (they need it to sign in on another device).
  const [reveal, setReveal] = useState(false);
  const ref = useRef<Identity | null>(null);

  const apply = useCallback((next: Identity) => {
    ref.current = next;
    setPlayer(next);
    persist(next);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Identity>;
        if (p.id && p.name) {
          const id = p.id;
          const next = { id, name: p.name, code: p.code ?? "" };
          ref.current = next;
          setPlayer(next);
        }
      }
    } catch {
      // corrupt/unavailable storage — fall through to the gate
    }
    setReady(true);
  }, []);

  const save = useCallback(
    (rawName: string) => {
      const name = rawName.trim().replace(/\s+/g, " ");
      if (!isValidName(name)) return;
      const isNew = !ref.current;
      const id = ref.current?.id ?? crypto.randomUUID();
      apply({ id, name, code: ref.current?.code ?? "" });
      if (isNew) setReveal(true);
      // Register/rename server-side; adopt the assigned sync code.
      void fetch("/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: id, name }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { code?: string } | null) => {
          if (d?.code) apply({ id, name, code: d.code });
        })
        .catch(() => {});
    },
    [apply],
  );

  const link = useCallback(
    async (code: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/player/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) return false;
        const d = (await res.json()) as Identity;
        if (!d?.id || !d?.name) return false;
        apply({ id: d.id, name: d.name, code: d.code ?? "" });
        return true;
      } catch {
        return false;
      }
    },
    [apply],
  );

  return (
    <IdentityContext.Provider value={{ player, ready, save, link }}>
      {children}
      {ready && !player ? <NameGate onCreate={save} onLink={link} /> : null}
      {ready && player && reveal ? (
        <CodeReveal code={player.code} onDone={() => setReveal(false)} />
      ) : null}
    </IdentityContext.Provider>
  );
}

/** One-time reminder shown right after a new identity is created. */
function CodeReveal({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-4xl border bg-card p-6 text-center shadow-xl">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          You&apos;re in! 🎉
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is your <strong>sync code</strong> — you need it to use the same
          name (and your predictions) on another device. Save it somewhere.
        </p>
        <div className="my-4 rounded-2xl bg-muted py-4 font-mono text-2xl font-semibold tracking-widest tabular-nums">
          {code ? formatCode(code) : "…"}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          You can always find it again next to your name in the header.
        </p>
        <Button type="button" onClick={onDone} className="w-full">
          Got it
        </Button>
      </div>
    </div>
  );
}

/** Required first-run gate: create a name, or link via an existing sync code. */
function NameGate({
  onCreate,
  onLink,
}: {
  onCreate: (name: string) => void;
  onLink: (code: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"new" | "link">("new");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function submit() {
    if (mode === "new") {
      if (isValidName(name)) onCreate(name);
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onLink(code);
    setBusy(false);
    if (!ok) setError("No identity found for that code.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-4xl border bg-card p-6 shadow-xl">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Welcome! 🇳🇴
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "new"
            ? "What's your name? It's used for your RSVPs and predictions — set once on this device."
            : "Used the app on another device? Enter your sync code to pick up your predictions here."}
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mode === "new" ? (
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sebastian"
              aria-label="Your name"
              maxLength={40}
            />
          ) : (
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              placeholder="e.g. AB12-CD34"
              aria-label="Sync code"
              maxLength={20}
              autoCapitalize="characters"
            />
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {mode === "link" ? (
            <p className="text-xs text-muted-foreground">
              Forgot your code? Ask the group admin — they can look it up for
              you.
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              busy ||
              (mode === "new" ? !isValidName(name) : code.trim().length < 4)
            }
            className="w-full"
          >
            {mode === "new"
              ? "Continue"
              : busy
                ? "Linking…"
                : "Sync this device"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "new" ? "link" : "new"));
            setError(null);
          }}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {mode === "new"
            ? "Already use this on another device? Enter a sync code"
            : "New here? Create your name instead"}
        </button>
      </div>
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Header chip: shows the name, with an inline rename + the sync code to copy. */
export function IdentityChip() {
  const { player, ready, save } = useIdentity();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!ready || !player) return null;

  if (open) {
    return (
      <div className="flex flex-col items-end gap-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidName(value)) {
              save(value);
              setOpen(false);
            }
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Edit your name"
            maxLength={40}
            className="h-8 w-32 text-sm"
          />
          <Button type="submit" size="sm" disabled={!isValidName(value)}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </form>
        {player.code ? (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(player.code).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => {},
              );
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Copy your sync code to use on another device"
          >
            Sync code:{" "}
            <span className="font-mono tracking-wide text-foreground">
              {formatCode(player.code)}
            </span>
            {copied ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(player.name);
        setOpen(true);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      title="Your name + sync code"
    >
      <span className="max-w-32 truncate font-medium text-foreground">
        {player.name}
      </span>
      <Pencil className="size-3.5" />
    </button>
  );
}
