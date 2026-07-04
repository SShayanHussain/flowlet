import { NextResponse } from "next/server";

/**
 * Standard success response: { data: T }
 * Matches convention from CLAUDE.md.
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * Standard error response: { error: { code, message } }
 * Never leak stack traces (CLAUDE.md hard rule).
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400
) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  );
}
