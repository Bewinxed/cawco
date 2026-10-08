/**
 * PKCE helpers for the OAuth flows the hub drives (OpenRouter).
 *
 * Claude account sign-in is not here: it runs through Claude Code's own
 * `claude auth login` on the machine that uses it.
 */

// biome-ignore lint/performance/noBarrelFile: this is the package's public entrypoint; consumers import "@cawco/auth" and expect one surface
export { generateCodeChallenge, generateCodeVerifier } from "./pkce";
