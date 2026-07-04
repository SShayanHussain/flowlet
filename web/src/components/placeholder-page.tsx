import { Badge } from "@/components/ui/badge";

export default function PlaceholderPage({ title, phase, description }: { title: string, phase: string, description: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <Badge variant="secondary" className="px-3 py-1 font-medium bg-primary/10 text-primary border-primary/20">
          Coming in {phase}
        </Badge>
      </div>
      <p className="text-muted-foreground text-lg">{description}</p>
      <div className="h-[400px] rounded-xl border border-dashed border-border/60 bg-muted/20 flex items-center justify-center mt-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <h3 className="font-semibold text-lg">{title} functionality</h3>
          <p className="text-muted-foreground">This feature will be built in {phase} of the roadmap.</p>
        </div>
      </div>
    </div>
  );
}
