import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // DDL goes to the direct endpoint: a transaction pooler mangles session
    // state, and pg_dump/DDL sessions leak `search_path` onto shared connections.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
