"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreVertical, Play, Plus, Workflow as WorkflowIcon } from "lucide-react";
import { centsToUsd, useApi, type Workflow } from "@/lib/api-client";

export default function WorkflowsPage() {
  const api = useApi();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<{ workflows: Workflow[] }>("/api/workflows").then((d) => setWorkflows(d.workflows));
  }, [api]);

  useEffect(load, [load]);

  async function toggle(wf: Workflow) {
    setBusy(wf.id);
    try {
      await api.patch(`/api/workflows/${wf.id}`, { enabled: !wf.enabled });
      setWorkflows((prev) => prev?.map((w) => (w.id === wf.id ? { ...w, enabled: !w.enabled } : w)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  async function run(wf: Workflow) {
    setBusy(wf.id);
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/workflows/${wf.id}/run`, {});
      toast.success("Run queued");
      router.push(`/runs/${runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(wf: Workflow) {
    try {
      await api.post(`/api/workflows/${wf.id}/duplicate`);
      toast.success("Duplicated");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    }
  }

  async function remove(wf: Workflow) {
    if (!confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/workflows/${wf.id}`);
      setWorkflows((prev) => prev?.filter((w) => w.id !== wf.id) ?? null);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground mt-1">Your automations.</p>
        </div>
        <Link href="/builder">
          <Button>
            <Plus className="h-4 w-4 mr-2" /> New workflow
          </Button>
        </Link>
      </div>

      {!workflows ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        </div>
      ) : workflows.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center gap-3 border-dashed">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <WorkflowIcon className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-lg">No workflows yet</h3>
          <p className="text-muted-foreground max-w-sm">
            Build a trigger → action → AI-step → branch → output pipeline in the builder.
          </p>
          <Link href="/builder">
            <Button className="mt-2">
              <Plus className="h-4 w-4 mr-2" /> Create your first workflow
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="divide-y divide-border/60">
          {workflows.map((wf) => (
            <div key={wf.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
              <button
                onClick={() => toggle(wf)}
                disabled={busy === wf.id}
                title={wf.enabled ? "Disable" : "Enable"}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  wf.enabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    wf.enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>

              <Link href={`/builder/${wf.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{wf.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    v{wf.version}
                  </Badge>
                  {wf.enabled ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] shrink-0" variant="outline">
                      enabled
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {wf.graph.nodes.length} nodes · updated {new Date(wf.updatedAt).toLocaleDateString()}
                  {wf.stats && wf.stats.runs30d > 0 && (
                    <>
                      {" · "}
                      {wf.stats.runs30d} runs/30d
                      {wf.stats.successRate !== null && ` · ${wf.stats.successRate}% ok`}
                      {wf.stats.costCents30d > 0 && ` · ${centsToUsd(wf.stats.costCents30d)}`}
                    </>
                  )}
                </p>
              </Link>

              <Button variant="outline" size="sm" onClick={() => run(wf)} disabled={busy === wf.id}>
                {busy === wf.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Run</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/builder/${wf.id}`)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`/runs?workflowId=${wf.id}`)}>
                    View runs
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicate(wf)}>Duplicate</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => remove(wf)} className="text-destructive">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
