import { getSession, Session } from "./session";
import { errorResponse } from "@/lib/api-response";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Ensures the user is authenticated.
 * Used in API routes.
 */
export async function requireAuth(): Promise<Session | Response> {
  const session = await getSession();
  if (!session) {
    return errorResponse("UNAUTHORIZED", "Authentication required", 401);
  }
  return session;
}

/**
 * Ensures the user is a member of the given workspace.
 * Used in API routes to enforce tenant isolation.
 */
export async function requireMember(workspaceId: string): Promise<Session | Response> {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.userId)
      )
    )
    .limit(1);

  if (!membership) {
    return errorResponse("FORBIDDEN", "You do not have access to this workspace", 403);
  }

  return session;
}

/**
 * Ensures the user is an owner of the given workspace.
 * Used in API routes for administrative actions (billing, member management).
 */
export async function requireOwner(workspaceId: string): Promise<Session | Response> {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.userId)
      )
    )
    .limit(1);

  if (!membership || membership.role !== "owner") {
    return errorResponse("FORBIDDEN", "Only workspace owners can perform this action", 403);
  }

  return session;
}
