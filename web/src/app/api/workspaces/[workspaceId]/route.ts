import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { requireMember, requireOwner } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/api-response";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;
    
    // Check tenant isolation: user must be a member
    const session = await requireMember(workspaceId);
    if (session instanceof Response) return session;

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return errorResponse("NOT_FOUND", "Workspace not found.", 404);
    }

    return successResponse(workspace);
  } catch (error) {
    console.error("GET workspace error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const workspaceId = (await params).workspaceId;

    // Only owners can edit the workspace
    const session = await requireOwner(workspaceId);
    if (session instanceof Response) return session;

    const { name } = await request.json();

    if (!name) {
      return errorResponse("VALIDATION_ERROR", "Workspace name is required.");
    }

    const [updated] = await db
      .update(workspaces)
      .set({
        name: name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      return errorResponse("NOT_FOUND", "Workspace not found.", 404);
    }

    return successResponse(updated);
  } catch (error) {
    console.error("PATCH workspace error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
