import { defineConfig } from "drizzle-kit";

// Engine schema is owned here (api) but defined in packages/shared so the worker
// can import the same tables. Migrations are generated into ./migrations and
// applied by scripts/migrate.mjs (the api-owned engine migrator).
export default defineConfig({
  dialect: "postgresql",
  schema: "../packages/shared/src/db/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://flowlet:flowlet@localhost:5432/flowlet",
  },
});
