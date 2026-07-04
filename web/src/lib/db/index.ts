import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Postgres connection + Drizzle ORM client.
 *
 * Uses the `postgres` driver (by Porsager) — modern, ESM, lightweight.
 * Connection string comes from DATABASE_URL env var.
 *
 * Note: We lazily read DATABASE_URL to avoid import-time env validation
 * issues during build/codegen. The env module validates at runtime.
 */
const connectionString = process.env.DATABASE_URL!;

// Managed Postgres (RDS) requires TLS, but the postgres.js driver does not
// enable SSL by default (unlike psycopg on the AI service, which prefers SSL).
// Enable it for non-local hosts so production connections to RDS succeed.
// `rejectUnauthorized: false` encrypts without pinning the RDS CA (VPC-internal).
const isLocalDb = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(connectionString);

// For query purposes (connection pool)
const client = postgres(
  connectionString,
  isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }
);

export const db = drizzle(client, { schema });
