/**
 * Claude MAX OAuth Authentication
 *
 * Provides OAuth 2.0 authentication with PKCE for Claude Pro/Max subscriptions.
 *
 * Usage:
 * ```ts
 * import { login, logout, isAuthenticated, getValidAccessToken } from '@cawco/auth';
 *
 * // Check if authenticated
 * if (await isAuthenticated()) {
 *   const token = await getValidAccessToken();
 *   // Use token for API calls
 * } else {
 *   // Start OAuth flow
 *   await login();
 * }
 * ```
 */

// biome-ignore lint/performance/noBarrelFile: this is the package's public entrypoint; consumers import "@cawco/auth" and expect one surface
export {
  deleteCredentials,
  getCredentialsPath,
  getValidAccessToken,
  isAuthenticated,
  loadCredentials,
  saveCredentials,
} from "./credentials";
export {
  type LoginOptions,
  type LoginResult,
  login,
  logout,
} from "./login";

export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  getAuthHeaders,
  isTokenExpired,
  OAUTH_CONFIG,
  type OAuthTokens,
  refreshAccessToken,
  type StoredCredentials,
} from "./oauth";
