"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  workspaceId: string | null;
  accessToken: string | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ 
  children,
  initialUser = null,
  initialWorkspaceId = null
}: { 
  children: ReactNode;
  initialUser?: User | null;
  initialWorkspaceId?: string | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      const data = await res.json();
      
      if (res.ok && data.data?.accessToken) {
        setAccessToken(data.data.accessToken);
        // Note: we'd ideally decode the token or fetch /api/me to get user details here.
        // For Phase 1, we rely on the server component passing down initial state,
        // or just holding the token in memory for client-side fetches.
      } else {
        // Refresh failed, logged out
        setAccessToken(null);
        setUser(null);
        setWorkspaceId(null);
        if (pathname.startsWith("/dashboard") || pathname.startsWith("/settings")) {
          router.push("/login");
        }
      }
    } catch {
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
      setWorkspaceId(null);
      router.push("/login");
    }
  };

  // Initial load check
  useEffect(() => {
    // Only attempt refresh on mount if we're on a protected route or want to hydrate
    if (!accessToken) {
      refresh();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up periodic refresh before the 15m token expires (e.g. every 10m)
  useEffect(() => {
    if (!accessToken) return;
    
    const interval = setInterval(() => {
      refresh();
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ user, workspaceId, accessToken, isLoading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
