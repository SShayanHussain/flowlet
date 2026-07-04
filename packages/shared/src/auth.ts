import { jwtVerify, type JWTPayload } from "jose";

/**
 * Access-token verification shared across services.
 *
 * INTEGRATION SEAM: web/ ISSUES these tokens (src/lib/auth/tokens.ts) and api/
 * VERIFIES them here. Both must agree on the contract:
 *   - algorithm HS256
 *   - secret from JWT_ACCESS_SECRET
 *   - claims { userId, workspaceId } (+ standard sub/iat/exp)
 * Keep this in lockstep with web's signAccessToken.
 */
export interface AccessTokenPayload extends JWTPayload {
  userId: string;
  workspaceId: string;
}

function accessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("Missing env var: JWT_ACCESS_SECRET");
  return new TextEncoder().encode(secret);
}

/** Verify a Flowlet access token. Throws on invalid/expired. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret());
  return payload as AccessTokenPayload;
}
