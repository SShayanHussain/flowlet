"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { centsToUsd, NODE_META, useApi, type NodeType, type RunStatus, type RunStep } from "@/lib/api-client";

interface RunDetail {
  run: {
    id: string;
    status: RunStatus;
    triggerType: string;
    triggerPayload: unknown;
    costCents: number;
    error: { message?: string; nodeId?: string } | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  steps: RunStep[];
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic">—</span>;
  return (
    <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto max-h-64 border border-border/40">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function RunTracePage() {
  const api = useApi();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetail | null>(null);
  const [replaying, setReplaying] = useState(false);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<RunDetail>(`/api/runs/${id}`).then(setData).catch(() => setData(null));
  }, [api, id]);

  useEffect(load, [load]);

  // Poll while the run is still in flight.
  useEffect(() => {
    const s = data?.run.status;
    if (s !== "queued" && s !== "running") return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [data, load]);

  async function replay() {
    setReplaying(true);
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/runs/${id}/replay`);
      toast.success("Replay queued");
      router.push(`/runs/${runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to replay");
    } finally {
      setReplaying(false);
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  const { run, steps } = data;
  // Order steps by start time, unstarted last, for a readable trace.
  const ordered = [...steps].sort((a, b) => {
    const ta = a.startedAt ? Date.parse(a.startedAt) : Infinity;
    const tb = b.startedAt ? Date.parse(b.startedAt) : Infinity;
    return ta - tb;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono truncate">{run.id.slice(0, 8)}</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {run.triggerType} · {new Date(run.createdAt).toLocaleString()}
            {run.costCents > 0 && ` · ${centsToUsd(run.costCents)}`}
          </p>
        </div>
        <Button variant="outline" onClick={replay} disabled={replaying}>
          {replaying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
          Replay
        </Button>
      </div>

      {run.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {run.error.nodeId ? `Failed at node ${run.error.nodeId}: ` : "Failed: "}
          {run.error.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Trigger payload</CardTitle>
        </CardHeader>
        <CardContent>
          <Json value={run.triggerPayload} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Step trace</h2>
        {ordered.map((step) => {
          const meta = NODE_META[step.type as NodeType];
          return (
            <Card key={step.id} className="overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-muted/20">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: meta?.hue ?? "#888" }}
                />
                <span className="font-medium">{step.nodeId}</span>
                <Badge variant="outline" className="text-[10px]">
                  {meta?.label ?? step.type}
                </Badge>
                <div className="flex-1" />
                {(step.output as { cached?: boolean } | null)?.cached && (
                  <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 border-cyan-500/20">
                    cached
                  </Badge>
                )}
                {step.attempts > 1 && (
                  <span className="text-xs text-muted-foreground">{step.attempts} attempts</span>
                )}
                {step.latencyMs != null && (
                  <span className="text-xs text-muted-foreground">{step.latencyMs} ms</span>
                )}
                {step.costCents > 0 && (
                  <span className="text-xs text-muted-foreground">{centsToUsd(step.costCents)}</span>
                )}
                <StatusBadge status={step.status} />
              </div>
              {(step.status === "succeeded" || step.status === "failed" || step.status === "running") && (
                <div className="grid md:grid-cols-2 gap-4 p-5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</p>
                    <Json value={step.input} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {step.status === "failed" ? "Error" : "Output"}
                    </p>
                    <Json value={step.status === "failed" ? step.error : step.output} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
