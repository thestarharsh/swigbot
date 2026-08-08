import { config } from "dotenv";

/**
 * Must be the FIRST import in every script: imports evaluate before any
 * statement, so calling dotenv inline leaves lib/db already initialised
 * without DATABASE_URL.
 */
config({ path: [".env.local", ".env"], quiet: true });
