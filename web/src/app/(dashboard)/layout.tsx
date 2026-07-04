import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AuthProvider } from "@/components/providers/auth-provider";
import {
  LayoutDashboard,
  Workflow,
  PencilRuler,
  ListChecks,
  Plug,
  Settings,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { LogoutButton } from "./logout-button";
import { ProfileMenuItems } from "./profile-menu-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch workspace details
  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, session.workspaceId))
    .limit(1);

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/workflows", icon: Workflow, label: "Workflows" },
    { href: "/builder", icon: PencilRuler, label: "Builder" },
    { href: "/runs", icon: ListChecks, label: "Runs" },
    { href: "/connections", icon: Plug, label: "Connections" },
    { href: "/settings/profile", icon: Settings, label: "Settings" },
  ];

  return (
    <AuthProvider initialUser={session.user} initialWorkspaceId={session.workspaceId}>
      <div className="flex min-h-screen flex-col bg-muted/20">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-border/40 bg-background/95 px-4 sm:px-6 lg:px-8 backdrop-blur">
          <div className="flex items-center gap-3 flex-1">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <span className="font-bold tracking-tight hidden sm:block">Flowlet</span>
            </Link>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
              {workspace?.name || "Workspace"}
            </div>
          </div>
          
          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {session.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                }
              />
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{session.user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <ProfileMenuItems />
                <DropdownMenuSeparator />
                <LogoutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex flex-1 items-start">
          {/* Left Sidebar Nav */}
          <aside className="sticky top-16 z-30 hidden w-64 shrink-0 border-r border-border/40 lg:block self-start h-[calc(100vh-4rem)] bg-background">
            <nav className="flex flex-1 flex-col p-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <item.icon className="h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
