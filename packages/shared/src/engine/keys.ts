import { createHash } from "node:crypto";

/**
 * Idempotency-key derivation (design 03 §5). Deterministic hashes so a re-delivered
 * trigger or a retried send maps to the same ledger row.
 */

/** Layer 1 — one run per (workflow, trigger event). */
export function triggerIdempotencyKey(workflowId: string, deliveryId: string): string {
  return createHash("sha256").update(`trigger:${workflowId}:${deliveryId}`).digest("hex");
}

/** Layer 3 — one send per (run, output node). */
export function outputIdempotencyKey(runId: string, nodeId: string): string {
  return createHash("sha256").update(`output:${runId}:${nodeId}`).digest("hex");
}
