/**
 * Standard API envelope (CLAUDE.md): { data } on success, { error: { code, message } }
 * on failure. Framework-agnostic plain objects — services attach status codes.
 */
export function ok<T>(data: T) {
  return { data };
}

export function err(code: string, message: string) {
  return { error: { code, message } };
}

export type ApiSuccess<T> = ReturnType<typeof ok<T>>;
export type ApiError = ReturnType<typeof err>;
