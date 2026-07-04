/**
 * Retry taxonomy (design 03 §10).
 *
 * Retryable — timeout, connection reset, HTTP 429/5xx, transient provider errors:
 *   bounded exponential backoff via BullMQ attempts.
 * Terminal — HTTP 4xx (non-429), schema-invalid after N repairs, auth/validation:
 *   fail the step (and the run) immediately.
 *
 * Unknown errors default to RETRYABLE (bounded by max attempts): a transient crash
 * mid-step deserves a retry; a deterministic bug burns its attempts then fails
 * terminally — the safer default for at-least-once execution.
 */
export class StepError extends Error {
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: opts.cause });
    this.name = "StepError";
    this.retryable = opts.retryable;
  }
}

export function toStepError(err: unknown): StepError {
  if (err instanceof StepError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new StepError(message, { retryable: true, cause: err });
}

/** Classify an HTTP status for the retry taxonomy. */
export function stepErrorFromStatus(status: number, body?: string): StepError {
  const retryable = status === 429 || status >= 500;
  return new StepError(`HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ""}`, { retryable });
}
