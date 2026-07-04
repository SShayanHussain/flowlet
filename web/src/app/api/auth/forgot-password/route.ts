import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import crypto from "crypto";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/forgot-password
 *
 * Generates a reset token and sends a reset email.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return errorResponse("VALIDATION_ERROR", "Email is required.");
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (user) {
      // Generate token: 32 bytes hex string
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date();
      expires.setHours(expires.getHours() + 1); // 1 hour expiry

      await db
        .update(users)
        .set({
          resetToken,
          resetExpires: expires,
        })
        .where(eq(users.id, user.id));

      await sendPasswordResetEmail(user.email, resetToken);
    }

    // Always return success even if user not found (security best practice)
    return successResponse({ message: "If an account exists, a reset link was sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
