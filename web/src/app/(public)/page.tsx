import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center bg-slate-950 text-slate-50 min-h-screen font-sans selection:bg-indigo-500/30">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden py-24 lg:py-32 flex justify-center text-center">
        {/* Abstract Dark Theme Gradients */}
        <div className="absolute top-0 left-1/2 w-full -translate-x-1/2 h-full overflow-hidden -z-10 pointer-events-none">
          {/* Deep violet/indigo glow */}
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-[120px] mix-blend-screen animate-pulse"></div>
          <div className="absolute top-[10%] right-[5%] w-[500px] h-[500px] rounded-full bg-cyan-600/15 blur-[100px] mix-blend-screen"></div>
          {/* Subtle grid pattern over the dark background */}
          <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/dzs0q9m87/image/upload/v1709403814/grid_pattern.svg')] opacity-[0.03] mix-blend-overlay"></div>
        </div>

        <div className="container max-w-5xl px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center space-y-8">
            <div className="inline-flex items-center rounded-full border border-indigo-500/30 px-5 py-1.5 text-sm font-medium bg-indigo-950/40 backdrop-blur-md text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <span className="flex w-2.5 h-2.5 rounded-full bg-cyan-400 mr-2.5 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
              Flowlet 1.0 is now live — AI-native automation
            </div>

            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl/none bg-clip-text text-transparent bg-gradient-to-br from-white via-indigo-100 to-indigo-400 max-w-4xl drop-shadow-sm">
              Automations that can <br className="hidden sm:block" /> actually think.
            </h1>

            <p className="max-w-[700px] text-lg md:text-xl text-slate-300 font-light leading-relaxed">
              Build trigger → action → AI-step → branch → output pipelines that classify, extract,
              and decide — and run reliably at volume, without per-task pricing that punishes success.
            </p>

            {/* Workflow-graph motif */}
            <div className="flex items-center gap-2.5 text-xs font-semibold text-indigo-200 flex-wrap justify-center pt-4">
              {["Trigger", "Action", "AI step", "Branch", "Output"].map((n, i) => (
                <span key={n} className="flex items-center gap-2.5">
                  <span className="rounded-md border border-indigo-800/60 bg-indigo-950/50 px-4 py-2 shadow-sm backdrop-blur-sm transition-colors hover:border-indigo-500/50 hover:bg-indigo-900/50 cursor-default">
                    {n}
                  </span>
                  {i < 4 && <span className="text-cyan-400/70 text-lg">→</span>}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto pt-6">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-14 px-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all hover:shadow-[0_0_40px_rgba(79,70,229,0.5)] hover:-translate-y-0.5 active:translate-y-0 text-base font-semibold border border-indigo-500/50")}>
                Start Building for Free
              </Link>
              <Link href="/pricing" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-14 px-9 rounded-full border-slate-700 bg-slate-900/50 text-slate-200 hover:bg-slate-800 hover:text-white backdrop-blur-md transition-all hover:-translate-y-0.5 active:translate-y-0 text-base font-medium")}>
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-24 bg-slate-900/40 border-y border-slate-800/50 flex justify-center relative">
        <div className="container max-w-6xl px-4 md:px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-slate-50">Reasoning where rigid if/then fails</h2>
            <p className="mt-5 text-slate-400 text-lg max-w-2xl mx-auto font-light">Drop an AI step into an ordinary pipeline — structured output the rest of the flow can branch on.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50 p-8 shadow-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(79,70,229,0.15)] hover:border-indigo-500/40 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-900/50 border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-500 transition-all duration-300 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-100 group-hover:text-white transition-colors">AI as a node</h3>
                <p className="text-slate-400 leading-relaxed font-light group-hover:text-slate-300 transition-colors">
                  Configure a prompt from upstream data and a JSON output schema. The AI classifies, extracts, or drafts — and the flow branches on the result.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50 p-8 shadow-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] hover:border-cyan-500/40 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-950/50 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white group-hover:border-cyan-500 transition-all duration-300 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"></path></svg>
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-100 group-hover:text-white transition-colors">Reliable at volume</h3>
                <p className="text-slate-400 leading-relaxed font-light group-hover:text-slate-300 transition-colors">
                  Runs are queued jobs, not requests. When 500 fire at once they don&apos;t drop or double-execute — idempotency keys and fair queuing keep it honest.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50 p-8 shadow-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:border-purple-500/40 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-purple-900/30 border border-purple-500/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-500 transition-all duration-300 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-100 group-hover:text-white transition-colors">Full run observability</h3>
                <p className="text-slate-400 leading-relaxed font-light group-hover:text-slate-300 transition-colors">
                  Every run has a step-by-step trace: each node&apos;s input, output, latency, status, and cost. Retry or replay from the failure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-32 flex justify-center relative overflow-hidden">
        {/* Glow behind CTA */}
        <div className="absolute top-1/2 left-1/2 w-[800px] h-[400px] -translate-x-1/2 -translate-y-1/2 bg-indigo-600/10 blur-[100px] rounded-[100%] pointer-events-none"></div>
        
        <div className="container max-w-4xl px-4 md:px-6 text-center relative z-10">
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-6 text-white drop-shadow-md">Stop leaking hours on glue work</h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">Join ops teams using Flowlet to automate the handoffs between their tools — with an AI step that reasons, not just plumbing.</p>
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-16 px-12 rounded-full text-lg font-bold bg-white text-indigo-950 hover:bg-slate-100 shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] hover:-translate-y-1 active:translate-y-0")}>
            Get Started Now
          </Link>
        </div>
      </section>
    </div>
  );
}
