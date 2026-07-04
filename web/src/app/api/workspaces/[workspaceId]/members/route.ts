import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { requireMember, requireOwner } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/api-response";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;
    
    // Any member can view the team
    const session = await requireMember(workspaceId);
    if (session instanceof Response) return session;

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    return successResponse(members);
  } catch (error) {
    console.error("GET members error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;
    
    // Only owners can invite
    const session = await requireOwner(workspaceId);
    if (session instanceof Response) return session;

    const { email, role = "member" } = await request.json();

    if (!email) {
      return errorResponse("VALIDATION_ERROR", "Email is required.");
    }

    if (role !== "member" && role !== "owner") {
      return errorResponse("VALIDATION_ERROR", "Role must be member or owner.");
    }

    // 1. Find user by email
    const [userToInvite] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!userToInvite) {
      // In a full app, we would create an invitation record here and send an email.
      // For Phase 1, we just return an error if the user doesn't exist yet.
      return errorResponse("NOT_FOUND", "User not found. They must sign up first.", 404);
    }

    // 2. Check if already a member
    const [existing] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userToInvite.id)
        )
      )
      .limit(1);

    if (existing) {
      return errorResponse("CONFLICT", "User is already a member of this workspace.", 409);
    }

    // 3. Add to workspace
    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: userToInvite.id,
      role,
    });

    return successResponse({ message: "User added to workspace." }, 201);
  } catch (error) {
    console.error("POST member error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;
    
    const session = await requireOwner(workspaceId);
    if (session instanceof Response) return session;

    const { userId, role } = await request.json();

    if (!userId || !role || (role !== "member" && role !== "owner")) {
      return errorResponse("VALIDATION_ERROR", "Valid userId and role are required.");
    }

    // Prevent changing own role (could lock themselves out of owner privileges)
    // Wait, session might not have userId in the generic case, but we know it's a Session object here
    if (userId === ('userId' in session ? session.userId : '')) {
      return errorResponse("FORBIDDEN", "Cannot change your own role.", 403);
    }

    await db
      .update(workspaceMembers)
      .set({ role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      );

    return successResponse({ message: "Role updated." });
  } catch (error) {
    console.error("PATCH member error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;
    
    const session = await requireOwner(workspaceId);
    if (session instanceof Response) return session;

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return errorResponse("VALIDATION_ERROR", "userId is required.");
    }

    // Prevent removing self
    if (userId === ('userId' in session ? session.userId : '')) {
      return errorResponse("FORBIDDEN", "Cannot remove yourself from the workspace.", 403);
    }

    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      );

    return successResponse({ message: "Member removed." });
  } catch (error) {
    console.error("DELETE member error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
