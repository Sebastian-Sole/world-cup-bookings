import { create } from "zustand";
import type { HostStatus } from "@/lib/host-status";

/**
 * Client cache of hosting status + admin session flag.
 *
 * The server (Neon) is the source of truth: statuses are seeded from the RSC
 * page and refreshed from `/api/host-status`. Admin status comes from the
 * httpOnly session cookie via `/api/admin/session` — it is NOT persisted in
 * localStorage (the cookie is the real credential; this flag only gates UI).
 */

interface HostState {
  status: Record<string, HostStatus>;
  comments: Record<string, string>;
  /** Whether this browser holds a valid admin session cookie. */
  isAdmin: boolean;
  /** Whether the server admin password is configured at all. */
  adminConfigured: boolean;
  /** True once the initial session check has completed. */
  ready: boolean;

  setStatuses: (status: Record<string, HostStatus>) => void;
  setStatusLocal: (matchId: string, status: HostStatus) => void;
  clearStatusLocal: (matchId: string) => void;
  setComments: (comments: Record<string, string>) => void;
  setCommentLocal: (matchId: string, comment: string) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setAdminConfigured: (configured: boolean) => void;
  setReady: (ready: boolean) => void;
}

export const useHostStore = create<HostState>()((set) => ({
  status: {},
  comments: {},
  isAdmin: false,
  adminConfigured: false,
  ready: false,

  setStatuses: (status) => set({ status }),
  setStatusLocal: (matchId, status) =>
    set((s) => ({ status: { ...s.status, [matchId]: status } })),
  clearStatusLocal: (matchId) =>
    set((s) => {
      if (!(matchId in s.status)) return s;
      const { [matchId]: _removed, ...rest } = s.status;
      return { status: rest };
    }),
  setComments: (comments) => set({ comments }),
  setCommentLocal: (matchId, comment) =>
    set((s) => {
      const next = { ...s.comments };
      if (comment.trim() === "") delete next[matchId];
      else next[matchId] = comment.trim();
      return { comments: next };
    }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setAdminConfigured: (adminConfigured) => set({ adminConfigured }),
  setReady: (ready) => set({ ready }),
}));
