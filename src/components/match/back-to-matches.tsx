"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * "All matches" back link that returns to whichever home view the user last had
 * open (calendar or list) and whether they had revealed hidden matches,
 * defaulting to calendar. Both are remembered in localStorage by HomeTabs; we
 * read them after mount, so the server-rendered href is the calendar default and
 * there's no hydration mismatch.
 */
export function BackToMatches() {
  const [href, setHref] = useState("/?view=calendar");

  useEffect(() => {
    try {
      const params = new URLSearchParams();
      params.set(
        "view",
        localStorage.getItem("wc26-view") === "list" ? "list" : "calendar",
      );
      if (localStorage.getItem("wc26-hidden") === "1")
        params.set("hidden", "1");
      setHref(`/?${params.toString()}`);
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
