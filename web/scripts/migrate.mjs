// One-shot database migrator for the Flowlet shell tables (users / workspaces /
// workspace_members). Runs on the deploy host (which can reach RDS) as a
// short-lived container BEFORE the app starts. Safe to run repeatedly.
//
//   1. If the database was migrated by hand BEFORE Drizzle migration tracking
//      existed, "baseline" it so Drizzle does not try to re-create existing
//      tables (which would abort the deploy — PLAYBOOK §2).
//   2. Apply any pending migrations via Drizzle's programmatic migrator.
//
// Engine tables (workflows / runs / steps / connections / idempotency_keys)
// get their own migrations in Phase 1; this migrator will be consolidated then.
//
// Requires DATABASE_URL in the environment.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "src", "lib", "db", "migrations");

// Managed Postgres (RDS) requires TLS, but postgres.js does not enable SSL by
// default. Turn it on for non-local hosts. `rejectUnauthorized: false` encrypts
// the connection without pinning the RDS CA bundle (fine within a VPC).
function sslOptions(url) {
  const isLocal = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(url);
  return isLocal ? {} : { ssl: { rejectUnauthorized: false } };
}

function readJournal() {
  const raw = readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8");
  return JSON.parse(raw).entries.sort((a, b) => a.idx - b.idx);
}

// If the schema already exists (hand-migrated) but Drizzle's tracking table does
// not, record every journal entry as applied so `migrate()` becomes a no-op
// instead of re-creating tables and aborting the deploy.
async function baselineIfNeeded(sql) {
  const [{ present }] = await sql`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present
  `;
  if (present) {
    console.log("[migrate] Drizzle tracking already present — skipping baseline.");
    return;
  }

  const [{ schemaExists }] = await sql`
    SELECT to_regclass('public.users') IS NOT NULL AS "schemaExists"
  `;
  if (!schemaExists) {
    console.log("[migrate] Fresh database — no baseline needed.");
    return;
  }

  const journal = readJournal();
  console.log(
    `[migrate] Existing un-tracked database detected. Baselining ${journal.length} ` +
    `migration(s) so they are not re-applied.`
  );
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
  for (const entry of journal) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${"baseline_" + entry.tag}, ${entry.when})
    `;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, ...sslOptions(url) });
  try {
    await baselineIfNeeded(sql);

    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("[migrate] Migrations applied successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
