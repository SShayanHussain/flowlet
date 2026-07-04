import { cookies, headers } from "next/headers";
import { verifyRefreshToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface Session {
  userId: string;
  workspaceId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Get the current session for Server Components.
 *
 * It checks the 'x-user-id' and 'x-workspace-id' headers injected by the middleware.
 * If not present (e.g., page load where only refresh cookie exists), it verifies
 * the refresh cookie to get the session data.
 */
export async function getSession(): Promise<Session | null> {
  const headersList = await headers();
  let userId = headersList.get("x-user-id");
  let workspaceId = headersList.get("x-workspace-id");

  if (!userId || !workspaceId) {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("flowlet_refresh")?.value;

    if (!refreshToken) {
      return null;
    }

    try {
      const payload = await verifyRefreshToken(refreshToken);
      userId = payload.userId as string;
      workspaceId = payload.workspaceId as string;
    } catch {
      return null;
    }
  }

  if (!userId || !workspaceId) {
    return null;
  }

  // Fetch basic user info
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return null;
  }

  return {
    userId,
    workspaceId,
    user,
  };
}
