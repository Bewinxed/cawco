import { readWithin } from "@cawco/core/bounded";
import { accountConfigDir } from "@cawco/core/paths/claude";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import type { LimitWindow } from "@cawco/core/usage/types";
import { z } from "zod";
import { accountEnv, authStatusIn, bareEnv, notLockedAway } from "../accounts";
import { claudeHostVersion, claudeToStart } from "../claude-version";
import { accountLogin } from "../move-login";

/**
 * A Claude subscription's live windows, as Anthropic's usage endpoint
 * answers them for one account's login: the read Claude Code itself makes
 * for its windows (2.1.325's `fetchUtilization` with `read: "windows"`, the
 * one its limit rechecks use; `/usage` asks the same path without
 * `skip_spend`), sent as it sends it:
 *
 *     GET https://api.anthropic.com/api/oauth/usage?skip_spend=1
 *     Authorization: Bearer <claudeAiOauth.accessToken>
 *     anthropic-beta: oauth-2025-04-20
 *     User-Agent: claude-cli/<version> (external, cli)
 *     Content-Type: application/json
 *     Accept: application/json, text/plain, *\/*
 *
 *     {"five_hour":{"utilization":6.0,"resets_at":"…"},"seven_day":{…},
 *      "seven_day_opus":null,"seven_day_sonnet":{…},"extra_usage":{…},
 *      "limits":[{"kind":"session","group":"session","percent":6,
 *        "resets_at":"…","severity":"normal","is_active":true,"scope":null},
 *       {"kind":"weekly_scoped","group":"weekly","percent":40,"resets_at":"…",
 *        "severity":"normal","is_active":false,
 *        "scope":{"model":{"display_name":"Fable"}}}, …]}
 *
 * The windows are the `limits` rows, as the server sent them: Claude Code's
 * own word on them is "Classify a row on this [its `kind`], never on a
 * label", and "a new meter needs no client release" (its `/usage` result
 * schema, 2.1.325). Their kinds are the ones a `rate_limit_event` maps onto
 * (core usage/observed.ts: `session`, `weekly_all`, `weekly_scoped` with
 * the model's `display_name`), so a read and an event name each window
 * alike. A row scoped to a surface (another client's meter, not a model's)
 * limits nothing Claude Code runs, and is left out. A body with no `limits`
 * at all (a server that predates them) is no reading: nothing is guessed
 * from its named fields.
 *
 * The login is Claude Code's own, read from its store for the account's dir
 * (move-login.ts `accountLogin`) at call time for one request and never
 * logged, persisted or returned. CawCo never renews it: Claude Code does,
 * under its own lock, in every process it starts in the dir, the `claude
 * auth status` the agent runs there each minute among them ("sign-in
 * refresh … after a short command such as `claude auth status`", Claude
 * Code 2.1.301). A login past its expiry, or one the endpoint refuses with
 * 401, has that `auth status` run once more and is read again; a second
 * refusal is the answer. A login with no `user:inference` scope is a Console
 * one, which has no plan windows to read; one with no `user:profile` scope
 * (a long-lived setup-token's) is refused by the endpoint, and says so
 * without asking.
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage?skip_spend=1";
/** Claude Code's own bound on the read (`timeout:5000`, 2.1.325). */
const TIMEOUT_MS = 5000;
/** A login this close to its expiry is renewed first: the read would outlive it. */
const EXPIRY_MARGIN_MS = 60_000;

/** Claude Code's OAuth beta, as every request on a claude.ai login sends it. */
const OAUTH_BETA = "oauth-2025-04-20";
/** The scope a claude.ai subscription's login carries: one without it is a Console login. */
const INFERENCE_SCOPE = "user:inference";
/** The scope the usage endpoint asks for. */
const PROFILE_SCOPE = "user:profile";

const LoginSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    expiresAt: z.number().nullish(),
    scopes: z.array(z.string()).nullish(),
    subscriptionType: z.string().nullish(),
  }),
});
type Login = z.infer<typeof LoginSchema>["claudeAiOauth"];

/** One `limits` row, as Claude Code's own schema for the endpoint's body reads it. */
const RowSchema = z.object({
  kind: z.string(),
  group: z.string(),
  percent: z.number(),
  resets_at: z.string().nullable(),
  severity: z.string(),
  is_active: z.boolean(),
  scope: z
    .object({
      model: z.object({ display_name: z.string() }).nullish(),
      surface: z.object({ display_name: z.string() }).nullish(),
    })
    .nullish(),
});

const BodySchema = z.object({ limits: z.array(RowSchema).nullish() });

/** An ISO time with its zone written: a `resets_at` without one is UTC. */
const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/iu;

/**
 * A row's reset as {@link LimitWindow.resetsAt} holds it, to the whole
 * second: a `rate_limit_event` names its reset in epoch seconds, and the two
 * name one window's reset alike.
 */
const resetOf = (raw: string | null): string | null => {
  if (!raw) {
    return null;
  }
  const at = Date.parse(ZONED.test(raw) ? raw : `${raw}Z`);
  return Number.isFinite(at)
    ? new Date(Math.floor(at / 1000) * 1000).toISOString()
    : null;
};

/** The rows as windows, each a model's or every model's; a surface's rows left out. */
const windowsOf = (rows: z.infer<typeof RowSchema>[]): LimitWindow[] =>
  rows.flatMap((row) =>
    row.scope?.surface
      ? []
      : [
          {
            kind: row.kind,
            group: row.group,
            percent: row.percent,
            severity: row.severity,
            resetsAt: resetOf(row.resets_at),
            scopeLabel: row.scope?.model?.display_name ?? null,
            isActive: row.is_active,
          },
        ]
  );

/** What one read came to: the windows and plan, or why there are none. */
export type AnthropicUsageRead =
  | { ok: true; plan: string | null; windows: LimitWindow[] }
  | { ok: false; error: string };

/** One try: the read, a login to renew first (`stale`, with why), or a login with no plan windows (`none`). */
type Try =
  | { kind: "read"; read: AnthropicUsageRead }
  | { kind: "stale"; why: string }
  | { kind: "none" };

const failed = (error: string): Try => ({
  kind: "read",
  read: { ok: false, error },
});

/**
 * The account dir's login, as Claude Code keeps it; undefined when it holds
 * none it can read. A parse's own error is never passed on: it quotes the
 * text it read.
 */
const loginOf = async (account: string): Promise<Login | undefined> => {
  await notLockedAway(account, "read for its usage");
  const secret = await accountLogin(account);
  if (!secret) {
    return undefined;
  }
  let stored: unknown;
  try {
    stored = JSON.parse(secret);
  } catch {
    return undefined;
  }
  const parsed = LoginSchema.safeParse(stored);
  return parsed.success ? parsed.data.claudeAiOauth : undefined;
};

/** The endpoint's answer to `login`'s token. */
const ask = async (login: Login): Promise<Try> => {
  const version = await claudeHostVersion();
  const said = version.kind === "answered" ? version.value : undefined;
  if (!said) {
    return failed(
      "Claude Code on this machine said no version, which the usage read names itself by"
    );
  }
  const read = await readWithin(TIMEOUT_MS, async (signal): Promise<Try> => {
    const response = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${login.accessToken}`,
        "anthropic-beta": OAUTH_BETA,
        "User-Agent": `claude-cli/${said} (external, cli)`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      redirect: "error",
      signal,
    });
    if (response.status === 401) {
      await response.body?.cancel();
      return {
        kind: "stale",
        why: "the endpoint refused its login (HTTP 401)",
      };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return failed(
        response.status === 429
          ? "Anthropic's usage endpoint asked to be read less often (HTTP 429)"
          : `Anthropic's usage endpoint answered HTTP ${response.status}`
      );
    }
    const body = BodySchema.safeParse(await response.json());
    if (!body.success) {
      return failed(
        `Anthropic's usage endpoint answered a body Claude Code's own schema does not read: ${body.error.message}`
      );
    }
    if (!body.data.limits) {
      return failed(
        "Anthropic's usage endpoint answered with no limits rows, so its windows were not read"
      );
    }
    return {
      kind: "read",
      read: {
        ok: true,
        plan: login.subscriptionType ?? null,
        windows: windowsOf(body.data.limits),
      },
    };
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      return failed(
        `Anthropic's usage endpoint did not answer within ${secondsOf(read.after)}s`
      );
    default:
      unhandled("read", read);
  }
};

/** One read with the login the account's dir holds now. */
const tryOnce = async (account: string): Promise<Try> => {
  const login = await loginOf(account);
  if (!login) {
    return failed(
      "the account's dir on this machine holds no Claude login this read can use"
    );
  }
  const scopes = login.scopes ?? [];
  if (!scopes.includes(INFERENCE_SCOPE)) {
    return { kind: "none" };
  }
  if (!scopes.includes(PROFILE_SCOPE)) {
    return failed(
      `its login has no ${PROFILE_SCOPE} scope (a long-lived setup-token's), which Anthropic's usage endpoint refuses`
    );
  }
  if (
    typeof login.expiresAt === "number" &&
    login.expiresAt - Date.now() < EXPIRY_MARGIN_MS
  ) {
    return { kind: "stale", why: "its login is past its expiry" };
  }
  return await ask(login);
};

/**
 * Claude Code's own renewal of the dir's login: its `auth status`, which
 * renews a login near or past its expiry under Claude Code's lock. Its
 * answer is not read here: the read after it says whether the login works.
 */
const renew = async (account: string): Promise<void> => {
  await claudeToStart();
  await authStatusIn(
    { ...bareEnv(), ...accountEnv(account) },
    accountConfigDir(account)
  );
};

/**
 * The account's windows now, read with the login its dir holds on this
 * machine; undefined for a Console login, which has none.
 */
export const readAnthropicUsage = async (
  account: string
): Promise<AnthropicUsageRead | undefined> => {
  const first = await tryOnce(account);
  if (first.kind !== "stale") {
    return first.kind === "read" ? first.read : undefined;
  }
  await renew(account);
  const second = await tryOnce(account);
  switch (second.kind) {
    case "read":
      return second.read;
    case "none":
      return undefined;
    case "stale":
      return {
        ok: false,
        error: `${second.why}, and again after Claude Code's own \`claude auth status\` in its dir`,
      };
    default:
      unhandled("second", second);
  }
};
