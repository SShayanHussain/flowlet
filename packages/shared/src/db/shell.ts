import { pgTable, uuid, text } from "drizzle-orm/pg-core";

/**
 * READ-ONLY view of the shell `workspaces` table (owned by web/'s migrator).
 *
 * Defined in a SEPARATE file from db/schema.ts on purpose: the api engine
 * migrator introspects only schema.ts, so this never generates a CREATE TABLE
 * (which would collide with web's table). api/worker use it purely to read the
 * workspace's plan for plan-gating.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  plan: text("plan").notNull(),
});
