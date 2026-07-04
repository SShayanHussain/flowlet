import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden py-24 lg:py-32 bg-background flex justify-center text-center">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 w-full -translate-x-1/2 h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px] mix-blend-multiply opacity-70 animate-pulse"></div>
          <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-accent/30 blur-[100px] mix-blend-multiply opacity-50"></div>
        </div>

        <div className="container max-w-5xl px-4 md:px-6">
          <div className="flex flex-col items-center space-y-8">
            <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium bg-muted/30 backdrop-blur-sm border-border text-primary shadow-sm">
              <span className="flex w-2 h-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              Introducing Flowlet 1.0 — AI-native automation
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl/none bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70 max-w-4xl">
              Automations that can <br className="hidden sm:block" /> actually think.
            </h1>

            <p className="max-w-[700px] text-lg md:text-xl text-muted-foreground">
              Build trigger → action → AI-step → branch → output pipelines that classify, extract,
              and decide — and run reliably at volume, without per-task pricing that punishes success.
            </p>

            {/* Workflow-graph motif */}
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/80 flex-wrap justify-center pt-2">
              {["Trigger", "Action", "AI step", "Branch", "Output"].map((n, i) => (
                <span key={n} className="flex items-center gap-2">
                  <span className="rounded-md border border-border bg-card px-3 py-1.5 shadow-sm">{n}</span>
                  {i < 4 && <span className="text-primary">→</span>}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-12 px-8 rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 text-base")}>
                Start Building for Free
              </Link>
              <Link href="/pricing" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-8 rounded-full border-border bg-background/50 backdrop-blur-sm hover:bg-muted text-base transition-all hover:scale-105 active:scale-95")}>
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-20 bg-muted/30 border-y border-border/50 flex justify-center">
        <div className="container max-w-6xl px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Reasoning where rigid if/then fails</h2>
            <p className="mt-4 text-muted-foreground text-lg">Drop an AI step into an ordinary pipeline — structured output the rest of the flow can branch on.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group relative overflow-hidden rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/50">
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
              </div>
              <h3 className="mb-3 text-xl font-bold">AI as a node</h3>
              <p className="text-muted-foreground leading-relaxed">
                Configure a prompt from upstream data and a JSON output schema. The AI classifies, extracts, or drafts — and the flow branches on the result.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group relative overflow-hidden rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/50">
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"></path></svg>
              </div>
              <h3 className="mb-3 text-xl font-bold">Reliable at volume</h3>
              <p className="text-muted-foreground leading-relaxed">
                Runs are queued jobs, not requests. When 500 fire at once they don&apos;t drop or double-execute — idempotency keys and fair queuing keep it honest.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group relative overflow-hidden rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/50">
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
              </div>
              <h3 className="mb-3 text-xl font-bold">Full run observability</h3>
              <p className="text-muted-foreground leading-relaxed">
                Every run has a step-by-step trace: each node&apos;s input, output, latency, status, and cost. Retry or replay from the failure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-24 flex justify-center">
        <div className="container max-w-4xl px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">Stop leaking hours on glue work</h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">Join ops teams using Flowlet to automate the handoffs between their tools — with an AI step that reasons, not just plumbing.</p>
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-14 px-10 rounded-full text-lg shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95")}>
            Get Started Now
          </Link>
        </div>
      </section>
    </div>
  );
}
