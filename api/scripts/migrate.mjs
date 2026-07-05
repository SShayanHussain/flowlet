// One-shot migrator for the Flowlet ENGINE tables (workflows / workflow_runs /
// run_steps / connections / idempotency_keys). Runs on the deploy host before the
// api/worker start, AFTER the web shell migrator. Safe to run repeatedly.
//
// Baseline-aware (PLAYBOOK §2): if the engine schema already exists but Drizzle's
// tracking table does not, record the journal so `migrate()` is a no-op instead of
// re-creating tables and aborting the deploy.
//
// Requires DATABASE_URL in the environment.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// Engine + shell migrators share one database, so each MUST track in its own
// table — the drizzle default (drizzle.__drizzle_migrations) would collide and
// corrupt the other's history. Keep this in lockstep with web/scripts/migrate.mjs.
export const MIGRATIONS_TABLE = "__drizzle_migrations_engine";

function sslOptions(url) {
  const isLocal = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(url);
  return isLocal ? {} : { ssl: { rejectUnauthorized: false } };
}

function readJournal() {
  const raw = readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8");
  return JSON.parse(raw).entries.sort((a, b) => a.idx - b.idx);
}

async function baselineIfNeeded(sql) {
  const [{ present }] = await sql`
    SELECT to_regclass('drizzle.__drizzle_migrations_engine') IS NOT NULL AS present
  `;
  if (present) {
    console.log("[migrate:engine] Drizzle tracking already present — skipping baseline.");
    return;
  }
  const [{ schemaExists }] = await sql`
    SELECT to_regclass('public.workflows') IS NOT NULL AS "schemaExists"
  `;
  if (!schemaExists) {
    console.log("[migrate:engine] Fresh database — no baseline needed.");
    return;
  }
  const journal = readJournal();
  console.log(`[migrate:engine] Baselining ${journal.length} migration(s) on existing schema.`);
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations_engine (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )
  `;
  for (const entry of journal) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations_engine (hash, created_at)
      VALUES (${"baseline_" + entry.tag}, ${entry.when})
    `;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate:engine] DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, ...sslOptions(url) });
  try {
    await baselineIfNeeded(sql);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_DIR, migrationsTable: MIGRATIONS_TABLE });
    console.log("[migrate:engine] Migrations applied successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate:engine] Migration failed:", err);
  process.exit(1);
});
