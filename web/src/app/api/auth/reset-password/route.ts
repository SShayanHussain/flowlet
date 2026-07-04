import { NextRequest } from "next/server";
import { eq, and, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/passwords";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/reset-password
 *
 * Resets a password given a valid token.
 */
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return errorResponse("VALIDATION_ERROR", "Token and new password are required.");
    }

    if (password.length < 8) {
      return errorResponse("VALIDATION_ERROR", "Password must be at least 8 characters.");
    }

    // Check if token is valid and not expired
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.resetToken, token),
          gt(users.resetExpires, new Date())
        )
      )
      .limit(1);

    if (!user) {
      return errorResponse("INVALID_TOKEN", "Invalid or expired reset token.", 400);
    }

    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetExpires: null,
      })
      .where(eq(users.id, user.id));

    return successResponse({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
