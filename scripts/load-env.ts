import { config } from "dotenv";

/**
 * Must be the FIRST import in every script. Imports are evaluated before any
 * statement in the importing module, so calling dotenv inline leaves lib/db
 * already initialised from its localhost fallback, silently ignoring
 * DATABASE_URL.
 */
config({ path: [".env.local", ".env"], quiet: true });
