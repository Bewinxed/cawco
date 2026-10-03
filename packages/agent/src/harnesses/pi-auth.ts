/** A non-generating check of the credential serving pi's configured proxy model.
 * CPA v8.0.13 management/auth_files.go exposes "status_message": statusMessage
 * and "unavailable": unavailable, also used for cooldowns, with no dedicated
 * permanent-refresh marker. Source: https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.13/internal/api/handlers/management/auth_files.go
 */
import { homedir } from "node:os";
import { join } from "node:path";

export const PI_AUTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export interface PiCredentialState {
  reason?: string;
  state: "live" | "dead" | "unknown";
}

const EXPIRED_GRANT =
  /invalid_grant|(?:token|grant)[\s\S]{0,80}(?:expired|invalid|revoked)|(?:expired|invalid|revoked)[\s\S]{0,80}(?:token|grant)/i;
const PERMANENT_REFRESH = /refresh token|invalid_grant|expired/i;
const LAST_UPSTREAM = /last upstream error:([\s\S]*)/i;
const AUTH_UNAVAILABLE = /\bauth_unavailable\b/;

export function classifyProxyCredential(
  status: number,
  body: string,
  provider: string
): PiCredentialState {
  if (status >= 200 && status < 300) {
    return { state: "live" };
  }
  // Obelisk, CPA 8.0.13: 503 {"error":{"type":"api_error","message":
  // "auth_unavailable: no auth available (providers=claude, model=claude-opus-5;
  // last upstream error: token: [REDACTED] \"error_description\": \"Refresh token: [REDACTED])"}}
  // A quota-only auth_unavailable is unknown, not a dead sign-in.
  const upstream = body.match(LAST_UPSTREAM)?.[1];
  const dead =
    ((status === 400 || status === 401) && EXPIRED_GRANT.test(body)) ||
    (status === 503 &&
      AUTH_UNAVAILABLE.test(body) &&
      !!upstream &&
      PERMANENT_REFRESH.test(upstream));
  return dead
    ? {
        state: "dead",
        reason: `pi: ${provider} sign-in expired — sign in again`,
      }
    : {
        state: "unknown",
        reason: `pi: ${provider} sign-in status unknown — proxy HTTP ${status}`,
      };
}

function providerName(provider: string): string {
  const names: Record<string, string> = {
    anthropic: "Claude",
    claude: "Claude",
    openai: "OpenAI",
    codex: "OpenAI",
    google: "Gemini",
    gemini: "Gemini",
    xai: "xAI",
  };
  return names[provider] ?? provider;
}

export async function checkPiProxyCredential(model: {
  id: string;
  provider: string;
  baseUrl?: string;
}): Promise<PiCredentialState | undefined> {
  const file = Bun.file(
    join(homedir(), ".pi", "agent", "pi-cliproxyapi", "config.json")
  );
  if (!(await file.exists())) {
    return undefined;
  }
  const name = providerName(model.provider);
  try {
    const config = (await file.json()) as {
      proxy?: { endpoint?: string; apiKey?: string };
    };
    if (!(config.proxy?.endpoint && model.baseUrl)) {
      return undefined;
    }
    const endpoint = new URL(config.proxy.endpoint);
    // A native provider must never be tested against an unrelated proxy grant.
    if (new URL(model.baseUrl).origin !== endpoint.origin) {
      return undefined;
    }
    const response = await fetch(
      new URL("/v1/messages/count_tokens", endpoint),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": config.proxy.apiKey ?? "",
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    return classifyProxyCredential(
      response.status,
      await response.text(),
      name
    );
  } catch {
    return {
      state: "unknown",
      reason: `pi: ${name} sign-in status unknown — proxy check unavailable`,
    };
  }
}
