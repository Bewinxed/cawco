/**
 * TypeSafe's Jev — the hub's one Jev client, for meaning rules, fleet watch,
 * suggestions, placement and workflow `w.jev` — and the one rule for which
 * route it takes.
 *
 * Two routes reach the same System One API with the same body:
 * - **typesafe**: straight to TypeSafe with the key the hub holds
 *   (https://docs.typesafe.ai/api.md: "POST https://api.typesafe.ai/v1/systemone
 *   / Authorization: Bearer <API_KEY>").
 * - **openrouter**: through OpenRouter's System One endpoint with the key
 *   Settings connects by OAuth
 *   (https://openrouter.ai/docs/guides/community/typesafe-sdk — "`jev-latest`
 *   is routed as `~typesafe/jev-latest`").
 *
 * A held TypeSafe key is the route; otherwise OpenRouter; neither is Jev off.
 * A route that fails says so in its own words and is never swapped for the
 * other.
 *
 * One POST answers every question at once against one shared `state`
 * (https://docs.typesafe.ai/patterns/fan-out.md: "All questions are evaluated
 * in parallel"). Plain `fetch`, no SDK.
 */
import { CAWCO_ENV, readEnv } from "@cawco/core";
import type {
  JevAnswer,
  JevQuestion,
  JevResult,
  JevText,
} from "@cawco/core/workflow-program";
import type { DbShape } from "./db";

export type JevRoute = "typesafe" | "openrouter";

/** The route Jev takes and the key it takes it with. */
export interface JevAccess {
  readonly key: string;
  readonly route: JevRoute;
}

/** Each route's own name, as its failures are reported. */
export const ROUTE_NAME: Record<JevRoute, string> = {
  typesafe: "TypeSafe",
  openrouter: "OpenRouter",
};

/**
 * Where each route posts. `CAWCO_TYPESAFE_URL` points the typesafe route at
 * a local stand-in for its live proof, as `CAWCO_GITHUB_API` points the
 * pollers at a proxy.
 */
const ENDPOINT: Record<JevRoute, string> = {
  typesafe:
    readEnv(CAWCO_ENV.typesafeUrl) ?? "https://api.typesafe.ai/v1/systemone",
  openrouter: "https://openrouter.ai/api/v1/systemone",
};

/** OpenRouter's app attribution headers; TypeSafe takes only the key. */
const ROUTE_HEADERS: Record<JevRoute, Record<string, string>> = {
  typesafe: {},
  openrouter: {
    "HTTP-Referer": "https://github.com/bewinxed/cawco",
    "X-OpenRouter-Title": "CawCo",
  },
};

/**
 * The route Jev takes now: the TypeSafe key while the hub holds one, else the
 * OpenRouter connection, else none (Jev is off). The one place either is
 * chosen.
 */
export const jevAccess = (
  db: Pick<DbShape, "getJevSettings" | "getOpenRouterConnection">
): JevAccess | undefined => {
  const typesafe = db.getJevSettings().typesafeKey;
  if (typesafe) {
    return { route: "typesafe", key: typesafe };
  }
  const openrouter = db.getOpenRouterConnection();
  return openrouter
    ? { route: "openrouter", key: openrouter.apiKey }
    : undefined;
};

/** The first wait before a 429/529 is asked again; it doubles each time. */
const BACKOFF_MS = 500;

interface SystemOneResponse {
  answers: Record<string, JevAnswer>;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cost: number };
}

/**
 * Asks every question in one request on `access`'s route. A 429 or 529 is
 * asked again with exponential backoff until `timeoutMs` runs out — the
 * API's documented answer to both ("retry the request with exponential
 * backoff instead of retrying immediately", https://docs.typesafe.ai/api.md).
 * Every other failure throws with the route, the status and the body as the
 * API wrote them.
 */
export async function askJev<
  const Questions extends Readonly<Record<string, JevQuestion>>,
>(
  access: JevAccess,
  state: JevText,
  questions: Questions,
  options: { model?: string; timeoutMs: number }
): Promise<JevResult<Questions>> {
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const body = JSON.stringify({
    model: options.model ?? "jev-latest",
    state,
    questions,
  });
  for (let wait = BACKOFF_MS; ; wait *= 2) {
    // biome-ignore lint/performance/noAwaitInLoops: a throttled request is asked again only after the previous one answered
    const response = await fetch(ENDPOINT[access.route], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.key}`,
        "Content-Type": "application/json",
        ...ROUTE_HEADERS[access.route],
      },
      body,
      signal: deadline,
    });
    if (response.ok) {
      const parsed = (await response.json()) as SystemOneResponse;
      return {
        model: parsed.model,
        answers: parsed.answers as JevResult<Questions>["answers"],
        usage: {
          inputTokens: parsed.usage.input_tokens,
          outputTokens: parsed.usage.output_tokens,
          costUsd: parsed.usage.cost,
        },
      };
    }
    const failure = `${ROUTE_NAME[access.route]} answered ${response.status}: ${await response.text()}`;
    if (response.status !== 429 && response.status !== 529) {
      throw new Error(failure);
    }
    await new Promise<void>((resolve, reject) => {
      // Not on the hub's lifetime (lifetime.ts): a wait inside one request,
      // ended by the request's own deadline, like the fetch it sits between.
      const timer = setTimeout(resolve, wait);
      deadline.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error(`${failure} (still throttled when time ran out)`));
        },
        { once: true }
      );
    });
  }
}
