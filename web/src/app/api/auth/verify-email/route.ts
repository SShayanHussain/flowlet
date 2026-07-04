import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * GET /api/auth/verify-email
 *
 * Verifies a user's email given a token.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return errorResponse("VALIDATION_ERROR", "Token is required.");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verifyToken, token))
      .limit(1);

    if (!user) {
      return errorResponse("INVALID_TOKEN", "Invalid or expired verification token.", 400);
    }

    await db
      .update(users)
      .set({
        emailVerified: true,
        verifyToken: null,
      })
      .where(eq(users.id, user.id));

    return successResponse({ message: "Email verified successfully." });
  } catch (error) {
    console.error("Verify email error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
