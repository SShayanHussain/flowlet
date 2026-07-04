import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET() {
  try {
    const session = await requireAuth();
    if (session instanceof Response) return session;

    // Get all workspaces the user belongs to
    const userWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan: workspaces.plan,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, session.userId));

    return successResponse(userWorkspaces);
  } catch (error) {
    console.error("GET workspaces error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (session instanceof Response) return session;

    const { name } = await request.json();

    if (!name) {
      return errorResponse("VALIDATION_ERROR", "Workspace name is required.");
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 40)
      + "-" + crypto.randomBytes(3).toString("hex");

    // Start transaction since we insert into 2 tables
    const result = await db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name: name.trim(),
          slug,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: session.userId,
        role: "owner", // creator is always owner
      });

      return workspace;
    });

    return successResponse(result, 201);
  } catch (error) {
    console.error("POST workspace error:", error);
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
