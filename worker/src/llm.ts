import Anthropic from "@anthropic-ai/sdk";
import { StepError, type LlmClient } from "@flowlet/shared";

/**
 * Anthropic-backed LLM client for AI steps (design 03 §8).
 *
 * Uses the Messages API with structured outputs (`output_config.format`) so the
 * model is CONSTRAINED to the node's declared JSON schema. The engine still
 * parses + ajv-validates against the user's ORIGINAL schema (including the
 * constraints the API doesn't enforce) and runs the repair loop — this client
 * only produces text, never a trusted result.
 *
 * Model/limits are env-configured (PLAYBOOK: a model retirement is a config
 * change, not a code deploy).
 */

export interface AnthropicLlmOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** "adaptive" (default) or "off" — extraction/classification often runs fine off. */
  thinking?: "adaptive" | "off";
  /** For cost tracking, $ per million tokens (defaults match claude-opus-4-8). */
  inputCostPerMTok?: number;
  outputCostPerMTok?: number;
}

export function createAnthropicLlmClient(opts: AnthropicLlmOptions): LlmClient {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const inCost = opts.inputCostPerMTok ?? 5;
  const outCost = opts.outputCostPerMTok ?? 25;

  return {
    async generateStructured(req) {
      // The schema also rides in the system prompt: it guides generation on the
      // fallback path and improves adherence even when the API constrains output.
      const system =
        (req.system ? `${req.system}\n\n` : "") +
        `Respond with a single JSON object matching this JSON schema exactly:\n${JSON.stringify(req.schema)}`;

      const base = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system,
        messages: [{ role: "user" as const, content: req.prompt }],
        ...(opts.thinking === "off" ? {} : { thinking: { type: "adaptive" as const } }),
      };

      let response: Anthropic.Message;
      try {
        try {
          response = await client.messages.create(
            {
              ...base,
              output_config: {
                format: {
                  type: "json_schema",
                  schema: sanitizeSchemaForApi(req.schema),
                },
              },
            },
            { signal: req.signal }
          );
        } catch (err) {
          // The user's schema may use features the structured-outputs subset
          // rejects (recursion, exotic keywords). Fall back to unconstrained
          // generation — the engine's ajv validate+repair loop still gates it.
          if (err instanceof Anthropic.BadRequestError) {
            response = await client.messages.create(base, { signal: req.signal });
          } else {
            throw err;
          }
        }
      } catch (err) {
        throw classifyAnthropicError(err);
      }

      if (response.stop_reason === "refusal") {
        throw new StepError("LLM refused the request (safety)", { retryable: false });
      }
      if (response.stop_reason === "max_tokens") {
        throw new StepError(
          `LLM output truncated at ${opts.maxTokens} tokens — raise LLM_MAX_TOKENS or simplify the schema`,
          { retryable: false }
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      return {
        text,
        inputTokens,
        outputTokens,
        costCents: Math.ceil(((inputTokens / 1e6) * inCost + (outputTokens / 1e6) * outCost) * 100),
      };
    },
  };
}

/** Map SDK exceptions onto the engine's retry taxonomy (429/5xx/network retry). */
function classifyAnthropicError(err: unknown): StepError {
  if (err instanceof Anthropic.RateLimitError) {
    return new StepError("LLM provider rate limit (429)", { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new StepError(`LLM provider error (${err.status})`, { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new StepError("LLM connection failed", { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new StepError(`LLM request rejected (${err.status}): ${err.message}`, {
      retryable: false,
      cause: err,
    });
  }
  if (err instanceof StepError) return err;
  return new StepError(err instanceof Error ? err.message : String(err), {
    retryable: true,
    cause: err,
  });
}

// Structured outputs supports a JSON-Schema subset (objects need
// additionalProperties:false; numeric/string bounds unsupported). Strip what the
// API rejects — the engine validates the ORIGINAL schema client-side, so nothing
// is lost, the constraint just moves to the validate+repair loop.
const UNSUPPORTED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
] as const;

export function sanitizeSchemaForApi(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;

    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(k)) continue;
      obj[k] = walk(v);
    }
    if (obj.type === "object") obj.additionalProperties = false;
    return obj;
  };
  return walk(schema) as Record<string, unknown>;
}
