import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin";

export const runtime = "nodejs";

/** POST /api/admin/logout — clears the admin session cookie. */
export async function POST(): Promise<Response> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
