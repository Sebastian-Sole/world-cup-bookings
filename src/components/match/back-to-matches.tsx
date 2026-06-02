"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * "All matches" back link that returns to whichever home view the user last had
 * open (calendar or list), defaulting to calendar. The view is remembered in
 * localStorage by HomeTabs; we read it after mount, so the server-rendered href
 * is the calendar default and there's no hydration mismatch.
 */
export function BackToMatches() {
  const [href, setHref] = useState("/?view=calendar");

  useEffect(() => {
    try {
      const v = localStorage.getItem("wc26-view");
      setHref(v === "list" ? "/?view=list" : "/?view=calendar");
    } catch {
      // localStorage unavailable — keep the calendar default
    }
  }, []);

  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      All matches
    </Link>
  );
}
