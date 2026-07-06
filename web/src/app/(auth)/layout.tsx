import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-muted/30 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]"></div>
        <div className="absolute top-[60%] -right-[10%] w-[400px] h-[400px] rounded-full bg-accent/20 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md p-4 flex flex-col items-center">
        <Link href="/" className="mb-8 font-bold text-2xl tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M7 8.2 12 14.6 17 8.2" /><circle cx="7" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="17" cy="6.6" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16.4" r="1.9" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span>Flowlet</span>
        </Link>
        
        {children}
      </div>
    </div>
  );
}
