"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Client for the Fastify domain API (workflows / runs / connections / dashboard).
 *
 * Routing: in prod nginx serves web + api on one origin, so calls are relative
 * (`/api/...`). In standalone dev (`npm run dev:web` without nginx) set
 * NEXT_PUBLIC_API_URL=http://localhost:3001 so the browser reaches Fastify
 * directly (CORS is open on the api). Auth routes (`/api/auth/*`) always stay on
 * web and are called relative — never through this client.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new ApiError(json.error?.code ?? "ERROR", json.error?.message ?? res.statusText, res.status);
  }
  return json.data as T;
}

/** Bound API client for the current session's access token. */
export function useApi() {
  const { accessToken } = useAuth();
  return useMemo(
    () => ({
      ready: Boolean(accessToken),
      get: <T>(p: string) => request<T>(p, accessToken),
      post: <T>(p: string, body?: unknown, headers?: Record<string, string>) =>
        request<T>(p, accessToken, { method: "POST", body: JSON.stringify(body ?? {}), headers }),
      patch: <T>(p: string, body?: unknown) =>
        request<T>(p, accessToken, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
      del: <T>(p: string) => request<T>(p, accessToken, { method: "DELETE" }),
    }),
    [accessToken]
  );
}

// ---------------------------------------------------------------------------
// DTOs (mirror the api responses; web is decoupled from @flowlet/shared)
// ---------------------------------------------------------------------------
export type NodeType = "trigger" | "http" | "transform" | "ai" | "branch" | "output";

export interface GraphNode {
  id: string;
  type: NodeType;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}
export interface GraphEdge {
  from: string;
  to: string;
  when?: string;
}
export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Workflow {
  id: string;
  name: string;
  graph: WorkflowGraph;
  enabled: boolean;
  version: number;
  webhookToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface RunSummary {
  id: string;
  workflowId: string;
  triggerType: string;
  status: RunStatus;
  costCents: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunStep {
  id: string;
  nodeId: string;
  type: NodeType;
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "skipped";
  input: unknown;
  output: unknown;
  attempts: number;
  latencyMs: number | null;
  costCents: number;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Connection {
  id: string;
  type: string;
  name: string;
  createdAt: string;
}

export interface DashboardStats {
  runsToday: number;
  successRate: number | null;
  activeWorkflows: number;
  costCentsThisMonth: number;
  recentFailures: {
    id: string;
    workflowId: string;
    workflowName: string;
    error: { message?: string; nodeId?: string } | null;
    finishedAt: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Node-type presentation metadata (builder + palette + trace)
// ---------------------------------------------------------------------------
export const NODE_META: Record<
  NodeType,
  { label: string; hue: string; description: string }
> = {
  trigger: { label: "Trigger", hue: "#22c55e", description: "Webhook, cron, or manual entry point" },
  http: { label: "HTTP action", hue: "#3b82f6", description: "Call an external API" },
  transform: { label: "Transform", hue: "#a855f7", description: "Reshape data with dot-path mapping" },
  ai: { label: "AI step", hue: "#f59e0b", description: "Classify / extract / draft → JSON schema" },
  branch: { label: "Branch", hue: "#ec4899", description: "Route on upstream JSON" },
  output: { label: "Output", hue: "#14b8a6", description: "Send the result somewhere" },
};

export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
