"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Workflow, DollarSign, Loader2 } from "lucide-react";
import { centsToUsd, useApi, type DashboardStats } from "@/lib/api-client";

export default function DashboardPage() {
  const api = useApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.ready) return;
    api
      .get<DashboardStats>("/api/dashboard/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [api]);

  const cards = [
    {
      label: "Runs today",
      value: stats ? String(stats.runsToday) : "—",
      hint: "Started since midnight UTC",
      icon: Activity,
      tint: "text-primary",
    },
    {
      label: "Success rate",
      value: stats ? (stats.successRate === null ? "—" : `${stats.successRate}%`) : "—",
      hint: "Succeeded / total, last 30 days",
      icon: CheckCircle2,
      tint: "text-emerald-500",
    },
    {
      label: "Active workflows",
      value: stats ? String(stats.activeWorkflows) : "—",
      hint: "Enabled workflows",
      icon: Workflow,
      tint: "text-primary",
    },
    {
      label: "Cost this month",
      value: stats ? centsToUsd(stats.costCentsThisMonth) : "—",
      hint: "AI tokens + connector calls",
      icon: DollarSign,
      tint: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground text-lg">
        An overview of your automations — runs, reliability, and cost.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load stats: {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((s) => (
          <Card key={s.label} className="transition-all hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.tint}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? s.value : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />}
              </div>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent failures</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats || stats.recentFailures.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center border-t border-border/40 bg-muted/10 rounded-b-lg">
              <p className="text-muted-foreground italic">
                {stats ? "No failures — your workflows are running clean." : "Loading…"}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2 border-t border-border/40">
              {stats.recentFailures.map((f) => (
                <Link
                  key={f.id}
                  href={`/runs/${f.id}`}
                  className="flex items-start justify-between gap-4 rounded-md px-2 py-2 -mx-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">{f.workflowName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {f.error?.nodeId ? `node ${f.error.nodeId}: ` : ""}
                      {f.error?.message ?? "failed"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {f.finishedAt ? new Date(f.finishedAt).toLocaleString() : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
