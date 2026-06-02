import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Minimal admin auth — a single shared password, checked ONLY on the server.
 *
 * The password lives in the `ADMIN_PASSWORD` env var; it is never sent to the
 * client, never in the JS bundle. The login route compares the submitted value
 * server-side and, on success, sets a signed, httpOnly cookie (unreadable by
 * client JS) carrying an expiry + HMAC. Subsequent admin writes verify that
 * cookie server-side.
 *
 * The HMAC key is `ADMIN_SESSION_SECRET` if set, else the password itself, so
 * the only required env var to enable admin is `ADMIN_PASSWORD`.
 */

export const ADMIN_COOKIE = "wc26_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hmacKey(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sign(expMs: number): string {
  return createHmac("sha256", hmacKey()).update(String(expMs)).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** True if admin auth is configured at all (ADMIN_PASSWORD present). */
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Constant-time check of a submitted password against ADMIN_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false; // no password configured → no admin access
  return safeEqual(input, pw);
}

/** A fresh signed session token (`<expMs>.<hmac>`). */
export function createSessionToken(): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${exp}.${sign(exp)}`;
}

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
} as const;

/** Verify a session token's HMAC and expiry. */
export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(mac, sign(exp));
}

/** Whether the current request carries a valid admin session cookie. */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
