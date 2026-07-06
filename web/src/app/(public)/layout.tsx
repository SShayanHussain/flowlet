import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="font-bold text-xl tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center text-primary-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M7 8.2 12 14.6 17 8.2" /><circle cx="7" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="17" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16.4" r="1.9" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <span>Flowlet</span>
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Documentation</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/signup" className={cn(buttonVariants(), "rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95")}>Get Started</Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1">{children}</main>
      
      <footer className="border-t py-12 bg-muted/20">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center text-primary-foreground opacity-50 grayscale">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M7 8.2 12 14.6 17 8.2" /><circle cx="7" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="17" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16.4" r="1.9" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <span className="font-semibold text-muted-foreground">Flowlet</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Flowlet. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
