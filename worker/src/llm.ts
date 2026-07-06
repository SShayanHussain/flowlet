import { GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import { StepError, type LlmClient } from "@flowlet/shared";

/**
 * Gemini-backed LLM client for AI steps.
 *
 * Uses the generateContent API with structured outputs (`responseSchema`) so the
 * model is CONSTRAINED to the node's declared JSON schema. The engine still
 * parses + ajv-validates against the user's ORIGINAL schema.
 */

export interface GeminiLlmOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  /** "adaptive" (default) or "off" — extraction/classification often runs fine off. */
  thinking?: "adaptive" | "off";
  /** For cost tracking, $ per million tokens. */
  inputCostPerMTok?: number;
  outputCostPerMTok?: number;
}

export function createGeminiLlmClient(opts: GeminiLlmOptions): LlmClient {
  const ai = new GoogleGenerativeAI(opts.apiKey);
  const inCost = opts.inputCostPerMTok ?? 0.075;
  const outCost = opts.outputCostPerMTok ?? 0.30;

  return {
    async generateStructured(req) {
      const model = ai.getGenerativeModel({
        model: opts.model,
        systemInstruction: req.system,
      });

      const generationConfig = {
        maxOutputTokens: opts.maxTokens,
        responseMimeType: "application/json",
        responseSchema: sanitizeSchemaForApi(req.schema) as unknown as Schema,
      };

      let response;
      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig,
        });
        response = result.response;
      } catch (err) {
        throw classifyGeminiError(err);
      }

      if (response.promptFeedback?.blockReason) {
        throw new StepError("LLM refused the request (safety)", { retryable: false });
      }

      // Sometimes candidates[0].finishReason is MAX_TOKENS
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new StepError(
          `LLM output truncated — raise LLM_MAX_TOKENS or simplify the schema`,
          { retryable: false }
        );
      }

      const text = response.text() || "";
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        text,
        inputTokens,
        outputTokens,
        costCents: Math.ceil(((inputTokens / 1e6) * inCost + (outputTokens / 1e6) * outCost) * 100),
      };
    },
  };
}

/** Map SDK exceptions onto the engine's retry taxonomy. */
function classifyGeminiError(err: unknown): StepError {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) {
    return new StepError("LLM provider rate limit (429)", { retryable: true, cause: err });
  }
  if (msg.includes("500") || msg.includes("503") || msg.includes("internal error") || msg.includes("unavailable")) {
    return new StepError(`LLM provider error (5xx)`, { retryable: true, cause: err });
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return new StepError("LLM connection failed", { retryable: true, cause: err });
  }
  if (msg.includes("400") || msg.includes("bad request") || msg.includes("invalid argument")) {
    return new StepError(`LLM request rejected: ${err instanceof Error ? err.message : String(err)}`, {
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

// Strip unsupported schema constraints
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
  "additionalProperties",
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
    return obj;
  };
  return walk(schema) as Record<string, unknown>;
}
