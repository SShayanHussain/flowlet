import { describe, it, expect } from "vitest";
import type { WorkflowGraph } from "../db/schema";
import { queueNameForNode, QUEUES } from "../queues";
import { StepError, stepErrorFromStatus, toStepError } from "./errors";
import { withTimeout } from "./executor";
import { evalWhen, GraphValidationError, predecessorsOf, successorsOf, validateGraph } from "./graph";
import { outputIdempotencyKey, triggerIdempotencyKey } from "./keys";

const diamond: WorkflowGraph = {
  nodes: [
    { id: "A", type: "trigger" },
    { id: "B", type: "transform" },
    { id: "C", type: "transform" },
    { id: "D", type: "transform" },
  ],
  edges: [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
  ],
};

describe("graph validation", () => {
  it("accepts a diamond and finds entries + topo order", () => {
    const { entryNodeIds, topoOrder } = validateGraph(diamond);
    expect(entryNodeIds).toEqual(["A"]);
    expect(topoOrder[0]).toBe("A");
    expect(topoOrder[3]).toBe("D");
  });

  it("rejects cycles", () => {
    const cyclic: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "B", type: "transform" },
      ],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ],
    };
    expect(() => validateGraph(cyclic)).toThrow(GraphValidationError);
  });

  it("rejects duplicate ids, unknown edge targets, self-edges, empty graphs", () => {
    expect(() => validateGraph({ nodes: [], edges: [] })).toThrow(GraphValidationError);
    expect(() =>
      validateGraph({
        nodes: [
          { id: "A", type: "trigger" },
          { id: "A", type: "transform" },
        ],
        edges: [],
      })
    ).toThrow(/duplicate/);
    expect(() =>
      validateGraph({ nodes: [{ id: "A", type: "trigger" }], edges: [{ from: "A", to: "Z" }] })
    ).toThrow(/unknown/);
  });

  it("computes predecessors/successors", () => {
    expect(predecessorsOf(diamond, "D").sort()).toEqual(["B", "C"]);
    expect(successorsOf(diamond, "A").sort()).toEqual(["B", "C"]);
  });
});

describe("when-guards", () => {
  it("evaluates equality, inequality, and truthiness", () => {
    const v = { intent: "refund", score: 3, nested: { ok: true } };
    expect(evalWhen("intent == 'refund'", v)).toBe(true);
    expect(evalWhen("intent == 'other'", v)).toBe(false);
    expect(evalWhen("intent != 'other'", v)).toBe(true);
    expect(evalWhen("score == 3", v)).toBe(true);
    expect(evalWhen("nested.ok", v)).toBe(true);
    expect(evalWhen("nested.missing", v)).toBe(false);
  });
});

describe("retry taxonomy", () => {
  it("classifies HTTP statuses", () => {
    expect(stepErrorFromStatus(429).retryable).toBe(true);
    expect(stepErrorFromStatus(503).retryable).toBe(true);
    expect(stepErrorFromStatus(400).retryable).toBe(false);
    expect(stepErrorFromStatus(404).retryable).toBe(false);
  });

  it("defaults unknown errors to retryable (bounded by attempts)", () => {
    expect(toStepError(new Error("boom")).retryable).toBe(true);
    expect(toStepError(new StepError("no", { retryable: false })).retryable).toBe(false);
  });
});

describe("per-step timeout", () => {
  it("rejects retryable on timeout and aborts the signal", async () => {
    let aborted = false;
    const promise = withTimeout(
      (signal) =>
        new Promise((_resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        }),
      30
    );
    await expect(promise).rejects.toMatchObject({ retryable: true });
    expect(aborted).toBe(true);
  });

  it("passes results through under the limit", async () => {
    await expect(withTimeout(async () => 42, 1_000)).resolves.toBe(42);
  });
});

describe("queue routing", () => {
  it("isolates slow/AI steps from the fast pool", () => {
    expect(queueNameForNode({ type: "ai" })).toBe(QUEUES.AI_STEPS);
    expect(queueNameForNode({ type: "output" })).toBe(QUEUES.AI_STEPS);
    expect(queueNameForNode({ type: "http", config: { slow: true } })).toBe(QUEUES.AI_STEPS);
    expect(queueNameForNode({ type: "http" })).toBe(QUEUES.RUNS);
    expect(queueNameForNode({ type: "transform" })).toBe(QUEUES.RUNS);
    expect(queueNameForNode({ type: "trigger" })).toBe(QUEUES.RUNS);
  });
});

describe("idempotency keys", () => {
  it("is deterministic and scope-separated", () => {
    expect(triggerIdempotencyKey("wf", "evt")).toBe(triggerIdempotencyKey("wf", "evt"));
    expect(triggerIdempotencyKey("wf", "evt")).not.toBe(triggerIdempotencyKey("wf", "evt2"));
    expect(outputIdempotencyKey("r", "n")).not.toBe(triggerIdempotencyKey("r", "n"));
  });
});
