import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@flowlet/shared";

// Managed Postgres (RDS) requires TLS; postgres.js does not enable SSL by default.
// Enable it for non-local hosts (PLAYBOOK §2).
const connectionString = process.env.DATABASE_URL!;
const isLocalDb = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(connectionString);

export const client = postgres(
  connectionString,
  isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }
);

export const db = drizzle(client, { schema });
