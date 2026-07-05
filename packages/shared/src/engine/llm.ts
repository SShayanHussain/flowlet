/**
 * LLM client contract for the AI step (design 03 §8).
 *
 * The engine defines only this interface — the concrete implementation (the
 * Anthropic SDK client) lives in worker/ and is injected via EngineDeps.llm,
 * keeping shared free of the SDK dependency and api/ (which never executes
 * steps) free of LLM configuration entirely.
 */

export interface LlmStructuredRequest {
  /** Fully rendered prompt (templates already applied). */
  prompt: string;
  system?: string;
  /** The node's declared JSON schema — the provider constrains output to it. */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LlmStructuredResponse {
  /** Raw model output text — the engine parses + validates it (never trusts it). */
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost if the implementation can price the call. */
  costCents?: number;
}

export interface LlmClient {
  generateStructured(req: LlmStructuredRequest): Promise<LlmStructuredResponse>;
}

/** Per-workspace limiter at the LLM boundary (protects the shared budget). */
export interface AiRateLimiter {
  /** true → proceed; false → over limit, caller should back off (retryable). */
  take(workspaceId: string): Promise<boolean>;
}
