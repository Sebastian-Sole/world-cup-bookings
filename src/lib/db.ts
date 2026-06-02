import { type NeonQueryFunction, neon } from "@neondatabase/serverless";

/**
 * Lazy Neon HTTP client (BUILD_PLAN §3).
 *
 * The Neon driver throws if constructed with an undefined connection string, so
 * we must NOT do `export const sql = neon(process.env.DATABASE_URL!)` at module
 * top-level: that would crash `next build` and any module import whenever
 * DATABASE_URL is unset (it is unset until the user provisions Neon).
 *
 * Instead we construct the client lazily on first use and memoize it. The env
 * is read at call time; a clear runtime error is thrown only when a query is
 * actually executed without DATABASE_URL — never on import or build.
 *
 * The exported `sql` is a Proxy that forwards both tagged-template calls
 * (`sql\`...\``) and property access (`sql.transaction([...])`,
 * `sql.query(...)`) to the lazily-created underlying client, so `interest.ts`
 * and the route handlers can use it ergonomically as if it were a plain
 * `neon()` result.
 */

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

function getSql(): Sql {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon (Vercel Marketplace), then " +
        "`vercel env pull .env.local` and run `pnpm tsx scripts/migrate.ts`.",
    );
  }

  client = neon(url);
  return client;
}

export const sql = new Proxy((() => {}) as unknown as Sql, {
  // Tagged-template / function call: `sql\`SELECT ...\`` or `sql(strings, ...)`.
  apply(_target, _thisArg, args: Parameters<Sql>) {
    return (getSql() as (...a: Parameters<Sql>) => unknown)(...args);
  },
  // Property access: `sql.transaction`, `sql.query`, etc.
  get(_target, prop, receiver) {
    const value = Reflect.get(getSql() as object, prop, receiver);
    return typeof value === "function" ? value.bind(getSql()) : value;
  },
}) as Sql;
