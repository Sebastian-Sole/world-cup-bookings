import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  checkPassword,
  createSessionToken,
} from "@/lib/admin";

export const runtime = "nodejs";

/**
 * POST /api/admin/login — body { password }. Compares against ADMIN_PASSWORD
 * server-side; on success sets the signed httpOnly admin cookie. 401 otherwise.
 * A small constant delay blunts brute-force timing/throughput.
 */
export async function POST(request: Request): Promise<Response> {
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    // malformed body → treated as empty password → 401 below
  }

  await new Promise((r) => setTimeout(r, 300));

  if (!checkPassword(password)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(), ADMIN_COOKIE_OPTIONS);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
