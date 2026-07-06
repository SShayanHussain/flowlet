import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { connections, encryptCredentials, err, ok } from "@flowlet/shared";
import { requireAuth } from "../auth";
import type { ApiContext } from "./index";

/**
 * Connections — encrypted credentials at rest (CLAUDE.md hard rule). The
 * plaintext credential set is NEVER returned to the client; list/read expose
 * only metadata. Decryption happens only in the worker at step execution.
 */
export function registerConnectionRoutes(app: FastifyInstance, ctx: ApiContext) {
  const { db } = ctx;

  app.get("/api/connections", { preHandler: requireAuth }, async (request) => {
    const rows = await db
      .select({
        id: connections.id,
        type: connections.type,
        name: connections.name,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .where(eq(connections.workspaceId, request.auth!.workspaceId))
      .orderBy(desc(connections.createdAt));
    return ok({ connections: rows }); // no credentials field, by construction
  });

  app.post("/api/connections", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      name?: string;
      type?: string;
      credentials?: Record<string, unknown>;
    };
    if (!body?.name || !body?.type || !body?.credentials) {
      return reply.code(400).send(err("VALIDATION_ERROR", "name, type, and credentials are required"));
    }
    const [conn] = await db
      .insert(connections)
      .values({
        workspaceId: request.auth!.workspaceId,
        type: body.type,
        name: body.name,
        credentialsEncrypted: encryptCredentials(body.credentials),
      })
      .returning({
        id: connections.id,
        type: connections.type,
        name: connections.name,
        createdAt: connections.createdAt,
      });
    return reply.code(201).send(ok({ connection: conn }));
  });

  app.delete("/api/connections/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [deleted] = await db
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.workspaceId, request.auth!.workspaceId)))
      .returning({ id: connections.id });
    if (!deleted) return reply.code(404).send(err("NOT_FOUND", "Connection not found"));
    return ok({ deleted: true });
  });
}
