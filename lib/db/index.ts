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
 * hosted Postgres like Neon caps connections, and every instance opens its own
 * pool, so use the pooled endpoint there.
 */
const globalForDb = globalThis as unknown as { swigbotPool?: Pool };

const pool =
  globalForDb.swigbotPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
    idleTimeoutMillis: 10_000,
    // Neon's free tier suspends an idle compute; the first connection after
    // that pays a cold start, which a 10s budget can lose.
    connectionTimeoutMillis: 15_000,
  });

globalForDb.swigbotPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
