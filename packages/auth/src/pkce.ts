/**
 * PKCE (RFC 7636) verifier and S256 challenge.
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random code verifier for PKCE
 */
export function generateCodeVerifier(): string {
  // Generate 96 random bytes and encode as base64url (128 chars)
  return randomBytes(96).toString("base64url").slice(0, 128);
}

/**
 * Generate code challenge from verifier using S256 method
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
