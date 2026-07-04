import { refreshCookieOptions } from "@/lib/auth/tokens";
import { successResponse } from "@/lib/api-response";

/**
 * POST /api/auth/logout
 *
 * Clears the refresh token cookie.
 */
export async function POST() {
  const response = successResponse({ message: "Logged out" });

  const cookieOpts = refreshCookieOptions();
  response.cookies.set(cookieOpts.name, "", {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0, // expire immediately
  });

  return response;
}
