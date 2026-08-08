import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // No localhost fallback: it silently masked scripts that loaded dotenv late.
  throw new Error("DATABASE_URL is not set - copy .env.example to .env.local and fill it in");
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

/** One pool per process, kept across dev hot reloads and warm invocations. */
const globalForDb = globalThis as unknown as { swigbotPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
    // Idle below Neon's own cutoff, so it discards connections before the
    // server kills them; the long connect budget covers a compute cold start.
    idleTimeoutMillis: 8_000,
    keepAlive: true,
    connectionTimeoutMillis: 20_000,
  });

  // An idle client dying emits 'error' on the pool; unhandled, it kills the process.
  pool.on("error", (err) => {
    console.warn(`[db] idle client error, pool will replace it: ${err.message}`);
  });

  return withQueryRetry(pool);
}

const TRANSIENT =
  /Connection terminated|connection timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|server closed the connection|Client has encountered a connection error|terminating connection/i;

/** A dead socket, not a bad statement. */
export function isTransientDbError(err: unknown): boolean {
  return err instanceof Error && TRANSIENT.test(`${err.message} ${String(err.cause ?? "")}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retries queries whose connection died, so a suspended compute costs a retry
 * rather than the whole turn. Every write here is an upsert or an append-only
 * log, so a duplicate is the cheaper failure. Transactions would bypass this.
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
