import type { GraphNode, WorkflowGraph } from "../db/schema";

/**
 * Graph helpers — pure functions over the workflows.graph jsonb shape.
 * Validation runs at workflow-create time AND defensively at run-create time.
 */

export class GraphValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid workflow graph: ${problems.join("; ")}`);
    this.name = "GraphValidationError";
  }
}

export interface ValidatedGraph {
  entryNodeIds: string[];
  /** Kahn topological order — also proves acyclicity. */
  topoOrder: string[];
}

export function validateGraph(graph: WorkflowGraph): ValidatedGraph {
  const problems: string[] = [];
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  if (nodes.length === 0) problems.push("graph has no nodes");

  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n.id) problems.push("node with missing id");
    else if (ids.has(n.id)) problems.push(`duplicate node id '${n.id}'`);
    else ids.add(n.id);
  }
  for (const e of edges) {
    if (!ids.has(e.from)) problems.push(`edge from unknown node '${e.from}'`);
    if (!ids.has(e.to)) problems.push(`edge to unknown node '${e.to}'`);
    if (e.from === e.to) problems.push(`self-edge on '${e.from}'`);
  }
  if (problems.length > 0) throw new GraphValidationError(problems);

  // Kahn's algorithm: topological order; leftovers = cycle.
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);

  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const entryNodeIds = [...queue];
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const e of edges) {
      if (e.from !== id) continue;
      const d = indegree.get(e.to)! - 1;
      indegree.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  if (topoOrder.length !== nodes.length) {
    const cyclic = nodes.filter((n) => !topoOrder.includes(n.id)).map((n) => n.id);
    throw new GraphValidationError([`cycle involving: ${cyclic.join(", ")}`]);
  }
  if (entryNodeIds.length === 0) throw new GraphValidationError(["graph has no entry node"]);

  return { entryNodeIds, topoOrder };
}

export function nodeById(graph: WorkflowGraph, id: string): GraphNode {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Node '${id}' not in graph`);
  return node;
}

export function predecessorsOf(graph: WorkflowGraph, nodeId: string): string[] {
  return [...new Set(graph.edges.filter((e) => e.to === nodeId).map((e) => e.from))];
}

export function successorsOf(graph: WorkflowGraph, nodeId: string): string[] {
  return [...new Set(graph.edges.filter((e) => e.from === nodeId).map((e) => e.to))];
}

// ---------------------------------------------------------------------------
// Edge guards — the `when` mini-language for branch routing.
// Grammar (deliberately tiny, NO eval — sandboxing arbitrary JS is out of scope):
//   "<dot.path>"                 → truthy check
//   "<dot.path> == <literal>"    → equality (literal is JSON; 'single quotes' ok)
//   "<dot.path> != <literal>"    → inequality
// ---------------------------------------------------------------------------

export function resolvePath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function parseLiteral(raw: string): unknown {
  const trimmed = raw.trim();
  const normalized =
    trimmed.startsWith("'") && trimmed.endsWith("'")
      ? `"${trimmed.slice(1, -1)}"`
      : trimmed;
  try {
    return JSON.parse(normalized);
  } catch {
    // Unquoted bareword — treat as a string literal.
    return trimmed;
  }
}

export function evalWhen(guard: string, value: unknown): boolean {
  const neq = guard.includes("!=");
  const parts = neq ? guard.split("!=") : guard.split("==");
  if (parts.length === 1) {
    return Boolean(resolvePath(value, guard.trim()));
  }
  if (parts.length !== 2) {
    throw new GraphValidationError([`unsupported guard '${guard}'`]);
  }
  const left = resolvePath(value, parts[0].trim());
  const right = parseLiteral(parts[1]);
  return neq ? left !== right : left === right;
}
