import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // A localhost fallback here hid a real bug: scripts that loaded dotenv too
  // late connected to a database that did not exist instead of failing.
  throw new Error("DATABASE_URL is not set - copy .env.example to .env.local and fill it in");
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

/**
 * One pool per process, parked on globalThis so it survives dev hot reloads and
 * warm serverless invocations. Serverless defaults to a single connection: a
 * hosted Postgres caps connections and every instance opens its own pool.
 */
const globalForDb = globalThis as unknown as { swigbotPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
    // Below Neon's own idle cutoff, so the pool discards connections before the
    // server can kill them underneath us.
    idleTimeoutMillis: 8_000,
    keepAlive: true,
    // A suspended Neon compute has to cold start before it can accept us.
    connectionTimeoutMillis: 20_000,
  });

  // Without this listener, an idle client dying (Neon suspending the compute)
  // emits an unhandled 'error' on the pool and takes the process down.
  pool.on("error", (err) => {
    console.warn(`[db] idle client error, pool will replace it: ${err.message}`);
  });

  return withQueryRetry(pool);
}

const TRANSIENT =
  /Connection terminated|connection timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|server closed the connection|Client has encountered a connection error|terminating connection/i;

/** A dead socket, not a bad statement. Exported for tests. */
export function isTransientDbError(err: unknown): boolean {
  return err instanceof Error && TRANSIENT.test(`${err.message} ${String(err.cause ?? "")}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retries queries that fail because the connection died rather than because the
 * statement was bad. A suspended compute otherwise turns one message into a
 * user-visible failure. Retrying a write can duplicate it if the statement
 * committed before the socket dropped; the only writes here are upserts and
 * append-only logs, where a duplicate row is far cheaper than a lost turn.
 *
 * Drizzle issues queries via `pool.query`, so this covers every statement.
 * Transactions would take a raw client from `pool.connect()` and bypass it;
 * this codebase uses none.
 */
function withQueryRetry(pool: Pool): Pool {
  const original = pool.query.bind(pool);

  const retrying = async (...args: unknown[]): Promise<unknown> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await (original as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (err) {
        if (attempt >= 3 || !isTransientDbError(err)) throw err;
        console.warn(
          `[db] transient connection failure, retry ${attempt}/2: ${
            err instanceof Error ? err.message : err
          }`,
        );
        await sleep(attempt * 500);
      }
    }
  };

  pool.query = retrying as typeof pool.query;
  return pool;
}

const pool = globalForDb.swigbotPool ?? createPool();
globalForDb.swigbotPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
