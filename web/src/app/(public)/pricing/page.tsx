import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="flex flex-col items-center py-20">
      <div className="container max-w-5xl px-4 md:px-6">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start for free, upgrade when you need to run more automations at volume.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {/* Free Tier */}
          <Card className="flex flex-col h-full border-border/50 shadow-sm transition-all hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-2xl">Free</CardTitle>
              <CardDescription>Perfect for testing out Flowlet</CardDescription>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold">
                $0
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">2 workflows</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">100 runs / month</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">AI step + all node types</span>
                </li>
                <li className="flex items-center gap-3 text-muted-foreground opacity-50">
                  <div className="rounded-full bg-muted p-1"><Check className="h-4 w-4" /></div>
                  <span className="text-sm">Run history &amp; traces</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Get Started</Link>
            </CardFooter>
          </Card>

          {/* Pro Tier */}
          <Card className="flex flex-col h-full border-primary shadow-lg relative transform md:-translate-y-4">
            <div className="absolute -top-4 left-0 right-0 mx-auto w-32 rounded-full bg-primary px-3 py-1 text-center text-xs font-medium text-primary-foreground shadow-sm">
              Most Popular
            </div>
            <CardHeader>
              <CardTitle className="text-2xl text-primary">Pro</CardTitle>
              <CardDescription>For growing ops teams</CardDescription>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold">
                $49
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm font-medium">Unlimited workflows</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm font-medium">10,000 runs / month</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Semantic cache on AI steps</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Cost tracking per workflow</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/signup" className={cn(buttonVariants(), "w-full shadow-md transition-transform hover:scale-105 active:scale-95")}>Start Free Trial</Link>
            </CardFooter>
          </Card>

          {/* Team Tier */}
          <Card className="flex flex-col h-full border-border/50 shadow-sm transition-all hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-2xl">Team</CardTitle>
              <CardDescription>Seats & higher run limits</CardDescription>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold">
                $199
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Everything in Pro</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Team seats (owner / member)</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Highest run limits</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-1"><Check className="h-4 w-4 text-primary" /></div>
                  <span className="text-sm">Priority support</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Contact Sales</Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
