"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Loader2, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { centsToUsd, useApi, type RunSummary } from "@/lib/api-client";

function RunsList() {
  const api = useApi();
  const params = useSearchParams();
  const workflowId = params.get("workflowId");
  const [runs, setRuns] = useState<RunSummary[] | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    const q = workflowId ? `?workflowId=${workflowId}` : "";
    api.get<{ runs: RunSummary[] }>(`/api/runs${q}`).then((d) => setRuns(d.runs));
  }, [api, workflowId]);

  useEffect(load, [load]);

  // Auto-refresh while anything is still in flight.
  useEffect(() => {
    if (!runs?.some((r) => r.status === "queued" || r.status === "running")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [runs, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Runs</h1>
          <p className="text-muted-foreground mt-1">
            {workflowId ? "Runs for this workflow." : "Run history across all workflows."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {!runs ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        </div>
      ) : runs.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center gap-3 border-dashed">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <ListChecks className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-lg">No runs yet</h3>
          <p className="text-muted-foreground max-w-sm">
            Trigger a workflow — manually, via its webhook, or on a schedule — to see run traces here.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border/60">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/runs/${r.id}`}
              className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
            >
              <StatusBadge status={r.status} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm truncate">{r.id}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.triggerType} · {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              {r.costCents > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">{centsToUsd(r.costCents)}</span>
              )}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary/60" /></div>}>
      <RunsList />
    </Suspense>
  );
}
