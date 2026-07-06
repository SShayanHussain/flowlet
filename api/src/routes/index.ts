import type { FastifyInstance } from "fastify";
import type { CronSchedulerQueue, Db, EngineQueues } from "@flowlet/shared";
import { registerConnectionRoutes } from "./connections";
import { registerDashboardRoutes } from "./dashboard";
import { registerRunRoutes } from "./runs";
import { registerWorkflowRoutes } from "./workflows";

export interface ApiContext {
  db: Db;
  queues: EngineQueues;
  /** Optional: cron trigger sync is skipped when absent (unit tests). */
  cronQueue?: CronSchedulerQueue;
}

/**
 * Domain routes. HARD RULE (CLAUDE.md): nothing here executes a run — trigger
 * endpoints persist + enqueue via createRun; the worker does the rest.
 */
export function registerRoutes(app: FastifyInstance, ctx: ApiContext) {
  registerWorkflowRoutes(app, ctx);
  registerRunRoutes(app, ctx);
  registerConnectionRoutes(app, ctx);
  registerDashboardRoutes(app, ctx);
}
