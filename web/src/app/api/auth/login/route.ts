import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/passwords";
import {
  signAccessToken,
  signRefreshToken,
  refreshCookieOptions,
} from "@/lib/auth/tokens";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/login
 *
 * Validates credentials, returns access token + sets refresh cookie.
 * Picks the user's first workspace as the active one.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // --- Validate input ---
    if (!email || !password) {
      return errorResponse("VALIDATION_ERROR", "Email and password are required.");
    }

    // --- Find user ---
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password.", 401);
    }

    // --- Verify password ---
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("INVALID_CREDENTIALS", "Invalid email or password.", 401);
    }

    // --- Get user's first workspace ---
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1);

    if (!membership) {
      return errorResponse("NO_WORKSPACE", "No workspace found for this user.", 404);
    }

    // --- Issue tokens ---
    const accessToken = await signAccessToken({
      userId: user.id,
      workspaceId: membership.workspaceId,
    });
    const refreshToken = await signRefreshToken({
      userId: user.id,
      workspaceId: membership.workspaceId,
    });

    // --- Response ---
    const response = successResponse({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: membership.workspaceId },
    });

    // Set refresh token as httpOnly cookie
    const cookieOpts = refreshCookieOptions();
    response.cookies.set(cookieOpts.name, refreshToken, {
      httpOnly: cookieOpts.httpOnly,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
      maxAge: cookieOpts.maxAge,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
  }
}
