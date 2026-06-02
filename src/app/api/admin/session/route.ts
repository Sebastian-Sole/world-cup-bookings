import { NextResponse } from "next/server";
import { adminConfigured, isAdminRequest } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * GET /api/admin/session — lets the client know whether this browser is an
 * authenticated admin (from the httpOnly cookie it can't read itself), and
 * whether admin is even configured (so the UI can hide login when it isn't).
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    { isAdmin: await isAdminRequest(), configured: adminConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
