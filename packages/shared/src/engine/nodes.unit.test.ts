import { describe, it, expect, vi } from "vitest";
import type { WorkflowGraph } from "../db/schema";
import { StepError } from "./errors";
import type { LlmClient } from "./llm";
import { defaultExecutors, type StepContext } from "./nodes";
import { renderTemplate } from "./template";

function ctx(partial: Partial<StepContext>): StepContext {
  return {
    node: { id: "n", type: "transform" },
    graph: { nodes: [], edges: [] } as WorkflowGraph,
    inputs: {},
    triggerPayload: {},
    signal: new AbortController().signal,
    db: undefined as never, // unit tests never touch the db
    runId: "run-1",
    workspaceId: "ws-1",
    ...partial,
  };
}

describe("template rendering", () => {
  it("substitutes dot-paths, stringifies objects, blanks missing values", () => {
    const data = { order: { id: 42, items: [1, 2] }, customer: "Ada" };
    expect(renderTemplate("Order {{order.id}} for {{customer}}", data)).toBe("Order 42 for Ada");
    expect(renderTemplate("items={{order.items}}", data)).toBe("items=[1,2]");
    expect(renderTemplate("missing:[{{nope.x}}]", data)).toBe("missing:[]");
    expect(renderTemplate("all={{$}}", { a: 1 })).toBe('all={"a":1}');
  });
});

describe("transform node", () => {
  it("maps dot-paths into a new shape and merges set", async () => {
    const result = await defaultExecutors.transform(
      ctx({
        node: {
          id: "t",
          type: "transform",
          config: { map: { orderId: "order.id", who: "customer.name", all: "$" }, set: { source: "shop" } },
        },
        inputs: { A: { order: { id: 7 }, customer: { name: "Bo" } } },
      })
    );
    expect(result.value).toEqual({
      orderId: 7,
      who: "Bo",
      all: { order: { id: 7 }, customer: { name: "Bo" } },
      source: "shop",
    });
  });
});

describe("ai node", () => {
  const schema = {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["refund", "escalate"] },
      confidence: { type: "number" },
    },
    required: ["intent", "confidence"],
    additionalProperties: false,
  };

  function aiCtx(llm: LlmClient | undefined, extra: Partial<StepContext> = {}): StepContext {
    return ctx({
      node: {
        id: "ai1",
        type: "ai",
        config: { prompt: "Classify: {{subject}}", schema, maxRepairs: 2 },
      },
      inputs: { A: { subject: "Where is my refund?" } },
      llm,
      ...extra,
    });
  }

  it("fails terminally when no LLM client is configured (no fake results)", async () => {
    await expect(defaultExecutors.ai(aiCtx(undefined))).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining("not configured"),
    });
  });

  it("renders the prompt, validates the output, and returns structured JSON", async () => {
    const generate = vi.fn(async (req: { prompt: string }) => ({
      text: JSON.stringify({ intent: "refund", confidence: 0.93 }),
      inputTokens: 100,
      outputTokens: 20,
      costCents: 1,
    }));
    const result = await defaultExecutors.ai(aiCtx({ generateStructured: generate }));
    expect(result.value).toEqual({ intent: "refund", confidence: 0.93 });
    expect(result.costCents).toBe(1);
    expect(generate.mock.calls[0]![0].prompt).toContain("Where is my refund?");
  });

  it("repairs invalid output by re-prompting with the validation errors", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: "not json at all", inputTokens: 1, outputTokens: 1 })
      .mockResolvedValueOnce({
        text: JSON.stringify({ intent: "banana", confidence: 1 }), // fails enum
        inputTokens: 1,
        outputTokens: 1,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ intent: "escalate", confidence: 0.7 }),
        inputTokens: 1,
        outputTokens: 1,
      });
    const result = await defaultExecutors.ai(aiCtx({ generateStructured: generate }));
    expect(result.value).toEqual({ intent: "escalate", confidence: 0.7 });
    expect(generate).toHaveBeenCalledTimes(3);
    // Repair prompts carry the failure reason forward.
    expect(generate.mock.calls[1][0].prompt).toContain("not valid JSON");
    expect(generate.mock.calls[2][0].prompt).toContain("invalid against the required JSON schema");
  });

  it("is TERMINAL after exhausting repairs — unvalidated output never flows on", async () => {
    const generate = vi.fn(async () => ({
      text: JSON.stringify({ wrong: true }),
      inputTokens: 1,
      outputTokens: 1,
    }));
    await expect(
      defaultExecutors.ai(aiCtx({ generateStructured: generate }))
    ).rejects.toMatchObject({ retryable: false, message: expect.stringContaining("schema validation") });
    expect(generate).toHaveBeenCalledTimes(3); // initial + 2 repairs
  });

  it("backs off retryably when the workspace is over its LLM budget", async () => {
    const generate = vi.fn();
    await expect(
      defaultExecutors.ai(
        aiCtx({ generateStructured: generate }, { aiRateLimiter: { take: async () => false } })
      )
    ).rejects.toMatchObject({ retryable: true, message: expect.stringContaining("rate limit") });
    expect(generate).not.toHaveBeenCalled(); // budget checked BEFORE spending tokens
  });

  it("propagates LLM StepErrors unchanged (e.g. provider 429 → retryable)", async () => {
    const generate = vi.fn(async () => {
      throw new StepError("LLM provider rate limit (429)", { retryable: true });
    });
    await expect(
      defaultExecutors.ai(aiCtx({ generateStructured: generate }))
    ).rejects.toMatchObject({ retryable: true });
  });
});

describe("http node config validation", () => {
  it("fails terminally without a url", async () => {
    await expect(
      defaultExecutors.http(ctx({ node: { id: "h", type: "http", config: {} } }))
    ).rejects.toMatchObject({ retryable: false });
  });
});

describe("AI-output cache (Phase 4)", () => {
  const schema = {
    type: "object",
    properties: { intent: { type: "string" } },
    required: ["intent"],
    additionalProperties: false,
  };
  function memCache() {
    const store = new Map<string, string>();
    return {
      cache: {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: string) => void store.set(k, v),
      },
      store,
    };
  }
  function aiNode(gen: LlmClient["generateStructured"], extra: Partial<StepContext>) {
    return defaultExecutors.ai(
      ctx({
        node: { id: "ai1", type: "ai", config: { prompt: "Classify: {{subject}}", schema } },
        inputs: { A: { subject: "refund please" } },
        llm: { generateStructured: gen },
        modelId: "test-model",
        ...extra,
      })
    );
  }

  it("misses then hits: identical input serves from cache at zero cost, no second LLM call", async () => {
    const { cache } = memCache();
    const generate = vi.fn(async () => ({
      text: JSON.stringify({ intent: "refund" }),
      inputTokens: 100,
      outputTokens: 10,
      costCents: 3,
    }));

    const first = await aiNode(generate, { cache });
    expect(first).toMatchObject({ value: { intent: "refund" }, costCents: 3 });
    expect(first.cached).toBeFalsy();

    const second = await aiNode(generate, { cache });
    expect(second).toEqual({ value: { intent: "refund" }, costCents: 0, cached: true });
    expect(generate).toHaveBeenCalledTimes(1); // ← second served from cache
  });

  it("does not consume the LLM rate budget on a cache hit", async () => {
    const { cache } = memCache();
    const generate = vi.fn(async () => ({
      text: JSON.stringify({ intent: "refund" }),
      inputTokens: 1,
      outputTokens: 1,
    }));
    await aiNode(generate, { cache }); // populate

    const take = vi.fn(async () => false); // budget exhausted
    const hit = await aiNode(generate, { cache, aiRateLimiter: { take } });
    expect(hit.cached).toBe(true);
    expect(take).not.toHaveBeenCalled(); // cache short-circuits before the limiter
  });

  it("bypasses the cache when the node opts out (cache: false)", async () => {
    const { cache } = memCache();
    const generate = vi.fn(async () => ({
      text: JSON.stringify({ intent: "refund" }),
      inputTokens: 1,
      outputTokens: 1,
    }));
    await defaultExecutors.ai(
      ctx({
        node: { id: "ai1", type: "ai", config: { prompt: "x", schema, cache: false } },
        inputs: { A: {} },
        llm: { generateStructured: generate },
        modelId: "test-model",
        cache,
      })
    );
    await defaultExecutors.ai(
      ctx({
        node: { id: "ai1", type: "ai", config: { prompt: "x", schema, cache: false } },
        inputs: { A: {} },
        llm: { generateStructured: generate },
        modelId: "test-model",
        cache,
      })
    );
    expect(generate).toHaveBeenCalledTimes(2); // never cached
  });
});
