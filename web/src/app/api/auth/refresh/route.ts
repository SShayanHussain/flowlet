import { NextRequest } from "next/server";

import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  refreshCookieOptions,
} from "@/lib/auth/tokens";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/refresh
 *
 * Reads refresh cookie, validates, returns new access token
 * and rotates the refresh token.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieName = refreshCookieOptions().name;
    const refreshToken = request.cookies.get(cookieName)?.value;

    if (!refreshToken) {
      return errorResponse("NO_REFRESH_TOKEN", "No refresh token provided.", 401);
    }

    // --- Verify refresh token ---
    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return errorResponse("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token.", 401);
    }

    // --- Issue new tokens (rotation) ---
    const accessToken = await signAccessToken({
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    });
    const newRefreshToken = await signRefreshToken({
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    });

    // --- Response ---
    const response = successResponse({ accessToken });

    // Rotate refresh cookie
    const cookieOpts = refreshCookieOptions();
    response.cookies.set(cookieOpts.name, newRefreshToken, {
      httpOnly: cookieOpts.httpOnly,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
      maxAge: cookieOpts.maxAge,
    });

    return response;
  } catch (error) {
    console.error("Refresh error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
  }
}
