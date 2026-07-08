import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50 selection:bg-indigo-500/30">
      <header className="sticky top-0 z-50 w-full border-b border-slate-800/60 bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="font-bold text-xl tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M7 8.2 12 14.6 17 8.2" /><circle cx="7" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="17" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16.4" r="1.9" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <span className="text-slate-50">Flowlet</span>
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="#" className="hover:text-white transition-colors">Documentation</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/signup" className={cn(buttonVariants(), "rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95 border border-indigo-500/50")}>Get Started</Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1">{children}</main>
      
      <footer className="border-t border-slate-800/60 py-12 bg-slate-900/50">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white opacity-40 grayscale">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M7 8.2 12 14.6 17 8.2" /><circle cx="7" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="17" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16.4" r="1.9" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <span className="font-semibold text-slate-400">Flowlet</span>
          </div>
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Flowlet. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
