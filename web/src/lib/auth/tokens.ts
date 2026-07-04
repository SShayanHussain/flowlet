import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// ---------------------------------------------------------------------------
// Token payload types
// ---------------------------------------------------------------------------
export interface TokenPayload extends JWTPayload {
  userId: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSecret(envVar: string): Uint8Array {
  const secret = process.env[envVar];
  if (!secret) {
    throw new Error(`Missing env var: ${envVar}`);
  }
  return new TextEncoder().encode(secret);
}

function getAccessSecret(): Uint8Array {
  return getSecret("JWT_ACCESS_SECRET");
}

function getRefreshSecret(): Uint8Array {
  return getSecret("JWT_REFRESH_SECRET");
}

function getAccessTTL(): number {
  return Number(process.env.JWT_ACCESS_TTL) || 900; // 15 min
}

function getRefreshTTL(): number {
  return Number(process.env.JWT_REFRESH_TTL) || 1_209_600; // 14 days
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------

/**
 * Sign a short-lived access token (default 15 min).
 * Sent in response body; stored in client memory (never localStorage).
 */
export async function signAccessToken(payload: {
  userId: string;
  workspaceId: string;
}): Promise<string> {
  return new SignJWT({ userId: payload.userId, workspaceId: payload.workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${getAccessTTL()}s`)
    .setSubject(payload.userId)
    .sign(getAccessSecret());
}

/**
 * Sign a long-lived refresh token (default 14 days).
 * Set as httpOnly secure cookie.
 */
export async function signRefreshToken(payload: {
  userId: string;
  workspaceId: string;
}): Promise<string> {
  return new SignJWT({ userId: payload.userId, workspaceId: payload.workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${getRefreshTTL()}s`)
    .setSubject(payload.userId)
    .sign(getRefreshSecret());
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Verify an access token. Returns the payload or throws on invalid/expired.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getAccessSecret());
  return payload as TokenPayload;
}

/**
 * Verify a refresh token. Returns the payload or throws on invalid/expired.
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getRefreshSecret());
  return payload as TokenPayload;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Cookie options for the refresh token. */
export function refreshCookieOptions() {
  return {
    name: "flowlet_refresh",
    httpOnly: true,
    secure: false, // process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: getRefreshTTL(),
  };
}
