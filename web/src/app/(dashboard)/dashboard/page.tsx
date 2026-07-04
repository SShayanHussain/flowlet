import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Workflow, DollarSign } from "lucide-react";

// NOTE: metrics are placeholders until the execution engine (ROADMAP Phase 1)
// lands the workflow_runs / run_steps tables. The dashboard reads from those
// once they exist; nothing here fabricates run data (PLAYBOOK: fail loud, no fakes).
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const stats = [
    { label: "Runs today", value: "—", hint: "Live once the engine ships", icon: Activity, tint: "text-primary" },
    { label: "Success rate", value: "—", hint: "Succeeded / total runs", icon: CheckCircle2, tint: "text-emerald-500" },
    { label: "Active workflows", value: "0", hint: "Enabled workflows", icon: Workflow, tint: "text-primary" },
    { label: "Cost this month", value: "$0.00", hint: "AI tokens + connector calls", icon: DollarSign, tint: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <p className="text-muted-foreground text-lg">
        An overview of your automations — runs, reliability, and cost.
      </p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="transition-all hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.tint}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
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
          <div className="h-[200px] flex items-center justify-center border-t border-border/40 bg-muted/10 rounded-b-lg">
            <p className="text-muted-foreground italic">
              No runs yet — build a workflow and trigger it to see run history here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
