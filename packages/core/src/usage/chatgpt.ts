import type { LimitWindow } from "./types";

/**
 * A ChatGPT subscription's live windows, as ChatGPT's own usage endpoint
 * answers them for the token of one sign-in:
 *
 *     GET https://chatgpt.com/backend-api/wham/usage
 *     Authorization: Bearer <access token>
 *     ChatGPT-Account-Id: <chatgpt_account_id>
 *     {"plan_type":"pro","rate_limit":{
 *        "primary_window":{"used_percent":12,"limit_window_seconds":18000,"reset_at":1760000000},
 *        "secondary_window":{"used_percent":40,"limit_window_seconds":604800,"reset_at":1760400000}}}
 *
 * (https://github.com/crafter-station/not-codex-micro/blob/main/RESEARCH.md;
 * Codex's own parser, codex-rs/codex-api/src/rate_limits.rs.) Each window maps
 * onto the {@link LimitWindow} placement, forecasts and at-limit already read,
 * by its length: 18000 s is the 5-hour window (`session`), 604800 s the
 * weekly one (`weekly_all`). The token is read at call time for one request
 * and never logged, persisted or returned.
 *
 * `CAWCO_CHATGPT_BASE_URL` points the read at another host: a test-only
 * setting for a scratch rig's mock, unset in production.
 */

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const TIMEOUT_MS = 10_000;

const TRAILING_SLASHES = /\/+$/;

export const chatgptBaseUrl = (): string =>
  (process.env.CAWCO_CHATGPT_BASE_URL || DEFAULT_BASE_URL).replace(
    TRAILING_SLASHES,
    ""
  );

interface WindowRaw {
  limit_window_seconds?: number | null;
  reset_after_seconds?: number | null;
  reset_at?: number | null;
  used_percent?: number | null;
}

interface UsageRaw {
  plan_type?: string | null;
  rate_limit?: {
    primary_window?: WindowRaw | null;
    secondary_window?: WindowRaw | null;
  } | null;
}

const FIVE_HOURS_S = 18_000;
const WEEK_S = 604_800;

/** The window kind and group a window of this length is, or nothing for a length CawCo has no window for. */
const shapeOf = (
  seconds: number | null | undefined
): { kind: string; group: string } | undefined => {
  if (seconds === FIVE_HOURS_S) {
    return { kind: "session", group: "session" };
  }
  if (seconds === WEEK_S) {
    return { kind: "weekly_all", group: "weekly" };
  }
  return undefined;
};

const severityOf = (percent: number): string => {
  if (percent >= 100) {
    return "critical";
  }
  return percent >= 80 ? "warning" : "normal";
};

/** The answer's windows, by length; a window of a length CawCo has no kind for is left out. */
export const chatgptWindows = (
  body: UsageRaw,
  now = Date.now()
): LimitWindow[] =>
  [body.rate_limit?.primary_window, body.rate_limit?.secondary_window].flatMap(
    (raw) => {
      const shape = raw ? shapeOf(raw.limit_window_seconds) : undefined;
      if (!(raw && shape)) {
        return [];
      }
      const percent = raw.used_percent ?? 0;
      let resetsAt: string | null = null;
      if (typeof raw.reset_at === "number") {
        resetsAt = new Date(raw.reset_at * 1000).toISOString();
      } else if (typeof raw.reset_after_seconds === "number") {
        resetsAt = new Date(now + raw.reset_after_seconds * 1000).toISOString();
      }
      return [
        {
          ...shape,
          percent,
          severity: severityOf(percent),
          resetsAt,
          scopeLabel: null,
          isActive: percent >= 100,
        },
      ];
    }
  );

/** What one read came to: the windows and plan, or the HTTP status that refused it. */
export type ChatgptUsageRead =
  | { ok: true; plan: string | null; windows: LimitWindow[] }
  | { ok: false; status: number | null; error: string };

/** Reads one sign-in's windows with its access token and ChatGPT account id. */
export const readChatgptUsage = async (
  accessToken: string,
  chatgptAccountId: string
): Promise<ChatgptUsageRead> => {
  try {
    const response = await fetch(`${chatgptBaseUrl()}/wham/usage`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "ChatGPT-Account-Id": chatgptAccountId,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `ChatGPT's usage endpoint answered HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as UsageRaw;
    return {
      ok: true,
      plan: body.plan_type ?? null,
      windows: chatgptWindows(body),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: `ChatGPT's usage endpoint did not answer: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** The claims of a ChatGPT access token CawCo reads: never the token itself. */
export interface ChatgptClaims {
  /** `https://api.openai.com/auth`.chatgpt_account_id */
  accountId: string | null;
  /** `https://api.openai.com/profile`.email */
  email: string | null;
  /** `https://api.openai.com/auth`.chatgpt_plan_type */
  plan: string | null;
}

/** A JWT's payload, unverified: it names who a token is, for a store the machine wrote itself. */
export const chatgptClaims = (accessToken: string): ChatgptClaims => {
  let payload: Record<string, unknown> = {};
  try {
    const part = accessToken.split(".")[1] ?? "";
    payload = JSON.parse(
      Buffer.from(
        part.replaceAll("-", "+").replaceAll("_", "/"),
        "base64"
      ).toString("utf8")
    ) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const auth = (payload["https://api.openai.com/auth"] ?? {}) as Record<
    string,
    unknown
  >;
  const profile = (payload["https://api.openai.com/profile"] ?? {}) as Record<
    string,
    unknown
  >;
  const text = (value: unknown): string | null =>
    typeof value === "string" && value ? value : null;
  return {
    accountId: text(auth.chatgpt_account_id),
    email: text(profile.email) ?? text(payload.email),
    plan: text(auth.chatgpt_plan_type),
  };
};
