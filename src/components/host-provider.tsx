"use client";

import { useEffect, useRef } from "react";
import type { HostStatus } from "@/lib/host-status";
import { useHostStore } from "@/store/host-store";

/**
 * Seeds the host store with server-rendered statuses and checks the admin
 * session once on mount. Wrap any page tree that shows status dots / controls.
 */
export function HostProvider({
  initialStatus,
  initialComments,
  children,
}: {
  initialStatus: Record<string, HostStatus>;
  initialComments: Record<string, string>;
  children: React.ReactNode;
}) {
  const setStatuses = useHostStore((s) => s.setStatuses);
  const setComments = useHostStore((s) => s.setComments);
  const setIsAdmin = useHostStore((s) => s.setIsAdmin);
  const setAdminConfigured = useHostStore((s) => s.setAdminConfigured);
  const setReady = useHostStore((s) => s.setReady);
  const seeded = useRef(false);

  // Seed synchronously on first render so the very first paint has the data.
  if (!seeded.current) {
    seeded.current = true;
    setStatuses(initialStatus);
    setComments(initialComments);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session")
      .then(
        (r) => r.json() as Promise<{ isAdmin: boolean; configured: boolean }>,
      )
      .then((d) => {
        if (cancelled) return;
        setIsAdmin(Boolean(d.isAdmin));
        setAdminConfigured(Boolean(d.configured));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setIsAdmin, setAdminConfigured, setReady]);

  return <>{children}</>;
}
