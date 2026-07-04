import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Need to duplicate logic here since middleware runs on Edge
// and can't use standard Node modules (like process.env in some contexts,
// though Next.js handles it mostly, it's safer to read directly).
function getAccessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("Missing JWT_ACCESS_SECRET");
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/health",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico"))) {
    return NextResponse.next();
  }

  // 2. Check for Authorization header (API routes) or token (App routes)
  // For API routes, we expect Authorization: Bearer <token>
  // For App routes, we rely on the client to redirect, or we could check a session cookie.
  // Wait, our design says: Access token is in memory, Refresh token is httpOnly.
  // So for App routes (e.g., /dashboard), the browser DOES NOT send the access token automatically.
  // It only sends the refresh token cookie.
  // To protect page routes, Next.js middleware would need to either:
  // a) Verify the refresh token cookie directly (not ideal, as it's long-lived and access token is the intended mechanism).
  // b) Let the client handle page routing protection based on memory state.
  // But PRD asks for secure routes. Let's verify the refresh token cookie for page requests.

  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    // API Route protection (requires Access Token in Authorization header)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    try {
      const { payload } = await jwtVerify(token, getAccessSecret());
      
      // Clone request and add headers for downstream handlers
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-id", payload.userId as string);
      requestHeaders.set("x-workspace-id", payload.workspaceId as string);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
        { status: 401 }
      );
    }
  } else {
    // Page Route protection
    // Check if they have a refresh cookie. If not, they are definitely logged out.
    // We don't verify it fully here to save CPU, but just check existence.
    // Client-side will try to use/refresh it.
    const hasRefreshCookie = request.cookies.has("flowlet_refresh");
    if (!hasRefreshCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
