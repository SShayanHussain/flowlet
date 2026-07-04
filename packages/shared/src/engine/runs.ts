import { eq } from "drizzle-orm";
import {
  idempotencyKeys,
  runSteps,
  workflowRuns,
  type Workflow,
  type WorkflowGraph,
} from "../db/schema";
import { queueForNode, stepJobOptions } from "../queues";
import type { EngineDeps } from "./deps";
import { nodeById, validateGraph } from "./graph";
import { triggerIdempotencyKey } from "./keys";

/**
 * Run creation (design 03 §4 ingest). Called by the API — which NEVER executes:
 * it snapshots the graph, seeds one run_steps row per node, and enqueues the
 * entry node(s). The worker does everything else.
 */

export interface CreateRunParams {
  workflow: Pick<Workflow, "id" | "workspaceId" | "graph" | "version">;
  triggerType: "webhook" | "cron" | "manual";
  triggerPayload?: unknown;
  /**
   * The trigger event's identity (e.g. webhook delivery id). Same (workflow,
   * deliveryId) → same run, no matter how often it is re-delivered (layer 1).
   * Absent → no dedupe (every call is a distinct event, e.g. manual clicks).
   */
  deliveryId?: string;
}

export interface CreateRunResult {
  runId: string;
  /** false → duplicate delivery; the existing run was returned and nothing enqueued. */
  created: boolean;
}

/** Internal sentinel: the idempotency insert lost — roll the transaction back. */
class DuplicateTriggerError extends Error {
  constructor() {
    super("duplicate trigger");
  }
}

export async function createRun(deps: EngineDeps, params: CreateRunParams): Promise<CreateRunResult> {
  const { db, queues } = deps;
  const graph = params.workflow.graph as WorkflowGraph;
  const { entryNodeIds } = validateGraph(graph);

  const key = params.deliveryId
    ? triggerIdempotencyKey(params.workflow.id, params.deliveryId)
    : null;

  let runId: string;
  try {
    runId = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(workflowRuns)
        .values({
          workflowId: params.workflow.id,
          workspaceId: params.workflow.workspaceId,
          workflowVersion: params.workflow.version,
          graphSnapshot: graph,
          triggerType: params.triggerType,
          triggerPayload: params.triggerPayload ?? null,
          status: "queued",
        })
        .returning({ id: workflowRuns.id });

      await tx.insert(runSteps).values(
        graph.nodes.map((node) => ({
          runId: run.id,
          workspaceId: params.workflow.workspaceId,
          nodeId: node.id,
          type: node.type,
          status: entryNodeIds.includes(node.id) ? "queued" : "pending",
        }))
      );

      if (key) {
        // Layer 1: the dedupe ledger. Losing the insert means another delivery of
        // this exact trigger event already created a run — abort ours entirely.
        const claimed = await tx
          .insert(idempotencyKeys)
          .values({ key, scope: "trigger", runId: run.id })
          .onConflictDoNothing()
          .returning({ key: idempotencyKeys.key });
        if (claimed.length === 0) throw new DuplicateTriggerError();
      }
      return run.id;
    });
  } catch (err) {
    if (err instanceof DuplicateTriggerError && key) {
      const [existing] = await db
        .select({ runId: idempotencyKeys.runId })
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, key))
        .limit(1);
      return { runId: existing!.runId!, created: false };
    }
    throw err;
  }

  // Enqueue AFTER commit so a worker can't race an uncommitted run. A crash in
  // this window leaves the run 'queued' with no job — the deterministic jobId
  // makes a future re-enqueue sweeper trivially safe (Phase 4 hardening).
  for (const nodeId of entryNodeIds) {
    const node = nodeById(graph, nodeId);
    await queueForNode(queues, node).add(
      "step",
      { runId, workspaceId: params.workflow.workspaceId, nodeId },
      stepJobOptions(runId, nodeId, deps.maxAttempts)
    );
  }

  return { runId, created: true };
}
