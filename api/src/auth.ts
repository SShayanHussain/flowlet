import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "@flowlet/shared";
import { err } from "@flowlet/shared";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string; workspaceId: string };
  }
}

/**
 * Fastify preHandler: require a valid Bearer access token.
 *
 * api/ does NOT issue tokens (web/ owns login/signup/refresh). It only verifies
 * the shared JWT and attaches { userId, workspaceId } for tenant-scoped handlers.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send(err("UNAUTHORIZED", "Missing or invalid token"));
  }
  try {
    const payload = await verifyAccessToken(header.slice("Bearer ".length));
    request.auth = { userId: payload.userId, workspaceId: payload.workspaceId };
  } catch {
    return reply.code(401).send(err("UNAUTHORIZED", "Invalid or expired token"));
  }
}
