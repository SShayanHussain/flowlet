import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  running: "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse",
  queued: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  pending: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  canceled: "bg-muted text-muted-foreground border-border",
  skipped: "bg-muted/50 text-muted-foreground/70 border-border/50",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", STYLES[status] ?? STYLES.pending)}>
      {status}
    </Badge>
  );
}
