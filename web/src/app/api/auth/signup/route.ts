import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import crypto from "crypto";

import { db } from "@/lib/db";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/passwords";
import {
  signAccessToken,
  signRefreshToken,
  refreshCookieOptions,
} from "@/lib/auth/tokens";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/signup
 *
 * Creates a user + their first workspace. Returns access token
 * and sets refresh token as httpOnly cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // --- Validate input ---
    if (!email || !password || !name) {
      return errorResponse("VALIDATION_ERROR", "Email, password, and name are required.");
    }

    if (typeof password !== "string" || password.length < 8) {
      return errorResponse("VALIDATION_ERROR", "Password must be at least 8 characters.");
    }

    // --- Check if user already exists ---
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return errorResponse("CONFLICT", "An account with this email already exists.", 409);
    }

    // --- Create user ---
    const passwordHash = await hashPassword(password);
    const verifyToken = crypto.randomBytes(32).toString("hex");

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name.trim(),
        verifyToken,
      })
      .returning({ id: users.id });

    // --- Create default workspace ---
    const slug = email
      .toLowerCase()
      .trim()
      .split("@")[0]
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 40)
      + "-" + crypto.randomBytes(3).toString("hex");

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: `${name.trim()}'s Workspace`,
        slug,
      })
      .returning({ id: workspaces.id });

    // --- Add user as owner ---
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
    });

    // --- Issue tokens ---
    const accessToken = await signAccessToken({
      userId: user.id,
      workspaceId: workspace.id,
    });
    const refreshToken = await signRefreshToken({
      userId: user.id,
      workspaceId: workspace.id,
    });

    // --- Dev: log verify token (no real email service yet) ---
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] Email verify token for ${email}: ${verifyToken}`);
    }

    // --- Response ---
    const response = successResponse(
      {
        accessToken,
        user: { id: user.id, email: email.toLowerCase().trim(), name: name.trim() },
        workspace: { id: workspace.id, slug },
      },
      201
    );

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
    console.error("Signup error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
  }
}
