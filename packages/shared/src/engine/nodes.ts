import { Ajv, type ValidateFunction } from "ajv";
import { eq } from "drizzle-orm";
import {
  connections,
  idempotencyKeys,
  type GraphNode,
  type NodeType,
  type WorkflowGraph,
} from "../db/schema";
import { decryptCredentials } from "../crypto";
import { StepError, stepErrorFromStatus, toStepError } from "./errors";
import { evalWhen, successorsOf } from "./graph";
import { outputIdempotencyKey } from "./keys";
import { renderTemplate } from "./template";
import type { DbLike } from "./deps";
import type { AiRateLimiter, LlmClient } from "./llm";

/**
 * Node executors (design 03 §8) — Phase 2: real bodies.
 * Failures classify via the retry taxonomy; nothing ever fakes an external
 * effect or an AI result (PLAYBOOK Golden Rule 1).
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
  llm?: LlmClient;
  aiRateLimiter?: AiRateLimiter;
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

// ---------------------------------------------------------------------------
// trigger — entry node; normalizes the trigger payload for the rest of the flow.
// ---------------------------------------------------------------------------
const trigger: NodeExecutor = async (ctx) => {
  return { value: ctx.triggerPayload ?? {} };
};

// ---------------------------------------------------------------------------
// transform — restricted mapping over upstream JSON. No eval, path lookups only.
// config: { map?: {outKey: "dot.path"}, set?: {key: literal} }
// ---------------------------------------------------------------------------
const transform: NodeExecutor = async (ctx) => {
  const input = mergedInput(ctx);
  const map = ctx.node.config?.map as Record<string, string> | undefined;
  const set = ctx.node.config?.set as Record<string, unknown> | undefined;

  if (map) {
    const out: Record<string, unknown> = {};
    for (const [outKey, path] of Object.entries(map)) {
      out[outKey] = resolveMapPath(input, path);
    }
    return { value: { ...out, ...(set ?? {}) } };
  }
  if (set && input !== null && typeof input === "object" && !Array.isArray(input)) {
    return { value: { ...(input as Record<string, unknown>), ...set } };
  }
  return { value: set ? { input, ...set } : input };
};

function resolveMapPath(input: unknown, path: string): unknown {
  if (path === "$") return input;
  let cur: unknown = input;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// branch — routes on upstream JSON (incl. AI-step output) via edge `when` guards.
// ---------------------------------------------------------------------------
const branch: NodeExecutor = async (ctx) => {
  const input = mergedInput(ctx);
  const taken: string[] = [];
  for (const edge of ctx.graph.edges) {
    if (edge.from !== ctx.node.id) continue;
    if (!edge.when || evalWhen(edge.when, input)) taken.push(edge.to);
  }
  return { value: input, taken };
};

// ---------------------------------------------------------------------------
// http — real fetch with connection credentials, timeout via ctx.signal, and
// status-code retry taxonomy (429/5xx retryable, other 4xx terminal).
// config: { url, method?, headers?, body?, connectionId?, slow? }
// Templates ({{path}}) in url/headers/body render against the merged input.
// ---------------------------------------------------------------------------
const http: NodeExecutor = async (ctx) => {
  const cfg = (ctx.node.config ?? {}) as {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    connectionId?: string;
  };
  if (!cfg.url) {
    throw new StepError(`http node '${ctx.node.id}' has no url configured`, { retryable: false });
  }
  const input = mergedInput(ctx);
  const url = renderTemplate(cfg.url, input);
  const method = (cfg.method ?? "POST").toUpperCase();

  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    headers[k.toLowerCase()] = renderTemplate(v, input);
  }
  await injectConnectionHeaders(ctx, cfg.connectionId, headers);

  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : JSON.stringify(cfg.body !== undefined ? renderJsonTemplates(cfg.body, input) : input);

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: ctx.signal });
  } catch (err) {
    // Network failure / abort — retryable (the timeout wrapper classifies aborts).
    throw toStepError(err);
  }

  const text = await response.text();
  if (!response.ok) throw stepErrorFromStatus(response.status, text);

  return { value: { status: response.status, body: parseMaybeJson(text, response) } };
};

async function injectConnectionHeaders(
  ctx: StepContext,
  connectionId: string | undefined,
  headers: Record<string, string>
): Promise<void> {
  if (!connectionId) return;
  const [conn] = await ctx.db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);
  // Tenant scope: a connection from another workspace must be invisible.
  if (!conn || conn.workspaceId !== ctx.workspaceId) {
    throw new StepError(`Connection ${connectionId} not found`, { retryable: false });
  }
  // Credentials are decrypted ONLY here, at step-execution time, in the worker.
  const creds = decryptCredentials(conn.credentialsEncrypted) as {
    headers?: Record<string, string>;
  };
  for (const [k, v] of Object.entries(creds.headers ?? {})) {
    headers[k.toLowerCase()] = v;
  }
}

function parseMaybeJson(text: string, response: Response): unknown {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function renderJsonTemplates(value: unknown, data: unknown): unknown {
  if (typeof value === "string") return renderTemplate(value, data);
  if (Array.isArray(value)) return value.map((v) => renderJsonTemplates(v, data));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderJsonTemplates(v, data)])
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// ai — prompt from upstream data → LLM constrained to the declared JSON schema
// → validate (ajv) → repair loop → structured output for branching (design 03 §8).
// config: { prompt, system?, schema, maxRepairs? }
// ---------------------------------------------------------------------------
const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

function validatorFor(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

const DEFAULT_MAX_REPAIRS = 2;

const ai: NodeExecutor = async (ctx) => {
  const cfg = (ctx.node.config ?? {}) as {
    prompt?: string;
    system?: string;
    schema?: Record<string, unknown>;
    maxRepairs?: number;
  };
  if (!ctx.llm) {
    // Fail loud — never emit a fake AI result (PLAYBOOK Golden Rule 1).
    throw new StepError(
      "AI step not configured: no LLM client (set LLM_API_KEY on the worker)",
      { retryable: false }
    );
  }
  if (!cfg.prompt || !cfg.schema) {
    throw new StepError(`ai node '${ctx.node.id}' requires prompt and schema config`, {
      retryable: false,
    });
  }
  if (ctx.aiRateLimiter && !(await ctx.aiRateLimiter.take(ctx.workspaceId))) {
    // Over the per-workspace LLM budget — back off and retry (not terminal).
    throw new StepError("LLM rate limit exceeded for workspace", { retryable: true });
  }

  const input = mergedInput(ctx);
  const prompt = renderTemplate(cfg.prompt, input);
  const validate = validatorFor(cfg.schema);
  const maxRepairs = cfg.maxRepairs ?? DEFAULT_MAX_REPAIRS;

  let costCents = 0;
  let lastErrors = "";
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const repairSuffix =
      attempt === 0
        ? ""
        : `\n\nYour previous output was invalid against the required JSON schema: ${lastErrors}. Respond again with ONLY a corrected JSON object.`;

    const res = await ctx.llm.generateStructured({
      prompt: prompt + repairSuffix,
      system: cfg.system,
      schema: cfg.schema,
      signal: ctx.signal,
    });
    costCents += res.costCents ?? 0;

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      lastErrors = "output was not valid JSON";
      continue;
    }
    if (validate(parsed)) {
      return { value: parsed, costCents };
    }
    lastErrors = ajv.errorsText(validate.errors);
  }

  // Bad schema after N repairs = TERMINAL (design 03 §10) — never pass through
  // unvalidated AI output for downstream branching.
  throw new StepError(
    `AI output failed schema validation after ${maxRepairs} repair attempt(s): ${lastErrors}`,
    { retryable: false }
  );
};

// ---------------------------------------------------------------------------
// output — the send. Layer-3 idempotency: claim the output key BEFORE sending,
// plus an Idempotency-Key header so the receiver can dedupe too.
// config: { url?, method?, headers?, connectionId? } — no url → no external
// effect; the payload is just recorded (nothing is faked).
// ---------------------------------------------------------------------------
const output: NodeExecutor = async (ctx) => {
  const cfg = (ctx.node.config ?? {}) as {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    connectionId?: string;
  };
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

  const payload = mergedInput(ctx);
  if (!cfg.url) {
    // No destination configured (e.g. terminal node used as a sink). No external
    // effect happens; record the payload honestly.
    return { value: { delivered: true, payload } };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": key,
  };
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    headers[k.toLowerCase()] = renderTemplate(v, payload);
  }
  await injectConnectionHeaders(ctx, cfg.connectionId, headers);

  try {
    let response: Response;
    try {
      response = await fetch(renderTemplate(cfg.url, payload), {
        method: (cfg.method ?? "POST").toUpperCase(),
        headers,
        body: JSON.stringify(payload),
        signal: ctx.signal,
      });
    } catch (err) {
      throw toStepError(err);
    }
    const text = await response.text();
    if (!response.ok) throw stepErrorFromStatus(response.status, text);
    return { value: { delivered: true, status: response.status } };
  } catch (err) {
    // The send FAILED cleanly — release the claim so a retry can re-send. The
    // deterministic Idempotency-Key header stays identical across retries, so a
    // request that ambiguously reached the server is deduped receiver-side. Only
    // a hard crash (no catch) leaves the claim, which then suppresses a
    // double-send after crash-post-send — exactly the window it exists for.
    await ctx.db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    throw err;
  }
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
