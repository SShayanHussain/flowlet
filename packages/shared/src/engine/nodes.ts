import { idempotencyKeys, type GraphNode, type NodeType, type WorkflowGraph } from "../db/schema";
import { evalWhen, successorsOf } from "./graph";
import { outputIdempotencyKey } from "./keys";
import type { DbLike } from "./deps";

/**
 * Node executors — Phase 1 scope (ROADMAP): the engine machinery is proven with
 * trivial node bodies; real http/ai implementations land in Phase 2. Stubs are
 * explicit pass-throughs, never fake external effects (PLAYBOOK Golden Rule 1).
 */

export interface StepContext {
  node: GraphNode;
  graph: WorkflowGraph;
  /** Delivered outputs keyed by predecessor node id (only delivering predecessors). */
  inputs: Record<string, unknown>;
  triggerPayload: unknown;
  signal: AbortSignal;
  db: DbLike;
  runId: string;
  workspaceId: string;
}

export interface StepResult {
  /** The value delivered to successors (and stored in run_steps.output.value). */
  value: unknown;
  /** Branch nodes only: successor node ids whose edges were taken. */
  taken?: string[];
  costCents?: number;
}

export type NodeExecutor = (ctx: StepContext) => Promise<StepResult>;
export type ExecutorRegistry = Record<NodeType, NodeExecutor>;

/** Single upstream → its value; several → keyed by node id; none → trigger payload. */
export function mergedInput(ctx: StepContext): unknown {
  const entries = Object.entries(ctx.inputs);
  if (entries.length === 0) return ctx.triggerPayload ?? {};
  if (entries.length === 1) return entries[0][1];
  return ctx.inputs;
}

const trigger: NodeExecutor = async (ctx) => {
  return { value: ctx.triggerPayload ?? {} };
};

const transform: NodeExecutor = async (ctx) => {
  const input = mergedInput(ctx);
  const set = ctx.node.config?.set as Record<string, unknown> | undefined;
  if (set && input !== null && typeof input === "object" && !Array.isArray(input)) {
    return { value: { ...(input as Record<string, unknown>), ...set } };
  }
  return { value: set ? { input, ...set } : input };
};

const branch: NodeExecutor = async (ctx) => {
  const input = mergedInput(ctx);
  const taken: string[] = [];
  for (const edge of ctx.graph.edges) {
    if (edge.from !== ctx.node.id) continue;
    if (!edge.when || evalWhen(edge.when, input)) taken.push(edge.to);
  }
  return { value: input, taken };
};

// Phase 2: real fetch with connection creds, timeout via ctx.signal, retry taxonomy
// from status codes. Until then: explicit pass-through.
const http: NodeExecutor = async (ctx) => {
  return { value: mergedInput(ctx) };
};

// Phase 2: prompt from upstream → LLM (per-workspace rate limit) → validate against
// declared JSON schema → repair loop → structured output. Until then: pass-through.
const ai: NodeExecutor = async (ctx) => {
  return { value: mergedInput(ctx) };
};

// The SEND itself is Phase 2, but the output-side idempotency claim (design 03 §5
// layer 3) is wired NOW so a retried job can never double-send once sends are real.
const output: NodeExecutor = async (ctx) => {
  const key = outputIdempotencyKey(ctx.runId, ctx.node.id);
  const claimed = await ctx.db
    .insert(idempotencyKeys)
    .values({ key, scope: "output", runId: ctx.runId })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (claimed.length === 0) {
    // Already sent by a previous attempt that crashed after the send — suppress.
    return { value: { delivered: false, deduplicated: true } };
  }
  // Phase 2: perform the actual send here, with a provider Idempotency-Key header.
  return { value: { delivered: true, payload: mergedInput(ctx) } };
};

export const defaultExecutors: ExecutorRegistry = {
  trigger,
  transform,
  branch,
  http,
  ai,
  output,
};

/** Successors that a completed node delivers to (branch: only taken edges). */
export function deliveredTargets(graph: WorkflowGraph, node: GraphNode, result: StepResult): string[] {
  if (node.type === "branch") return result.taken ?? [];
  return successorsOf(graph, node.id);
}
