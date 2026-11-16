/**
 * TypeSafe's Jev — the hub's one Jev client, for meaning rules, fleet watch,
 * suggestions and placement — and the one rule for which
 * route it takes.
 *
 * Jev is called through the AI SDK: `experimental_decide` from `ai` on
 * `@ai-sdk/typesafe-ai`'s decision model
 * (https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai). Two routes
 * reach the same System One API, one provider each:
 * - **typesafe**: TypeSafe's own base URL (the provider's default) with the
 *   key the hub holds.
 * - **openrouter**: OpenRouter's TypeSafe-compatible System One base URL with
 *   the key Settings connects by OAuth
 *   (https://openrouter.ai/docs/guides/community/typesafe-sdk —
 *   "`jev-latest` is routed as `~typesafe/jev-latest`").
 *
 * A held TypeSafe key is the route; otherwise OpenRouter; neither is Jev off.
 * A route that fails says so in its own words and is never swapped for the
 * other.
 *
 * One call answers every question at once against one shared `state`
 * (https://docs.typesafe.ai/patterns/fan-out.md: "All questions are evaluated
 * in parallel").
 */
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { secondsOf } from "@cawco/core/time";
import { costForUsage } from "@cawco/core/usage/pricing";
import {
  APICallError,
  type Experimental_DecisionQuestion,
  Experimental_DecisionRefusalError,
  type Experimental_DecisionResult,
  type Experimental_DecisionState,
  experimental_decide,
  RetryError,
} from "ai";
import type { DbShape } from "./db";
import type { JevResult } from "./jev-types";

type JevRoute = "typesafe" | "openrouter";

/** The route Jev takes and the key it takes it with. */
export interface JevAccess {
  readonly key: string;
  readonly route: JevRoute;
}

/** Each route's own name, as its failures are reported. */
const ROUTE_NAME: Record<JevRoute, string> = {
  typesafe: "TypeSafe",
  openrouter: "OpenRouter",
};

/**
 * Each route's provider settings past its key: TypeSafe's is the provider's
 * default base URL; OpenRouter's is its System One base URL, with its app
 * attribution headers.
 */
const ROUTE_SETTINGS: Record<
  JevRoute,
  { baseURL?: string; headers?: Record<string, string> }
> = {
  typesafe: {},
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://github.com/bewinxed/cawco",
      "X-OpenRouter-Title": "CawCo",
    },
  },
};

/** The model the hub asks: TypeSafe's alias for its latest stable Jev. */
const JEV_MODEL = "jev-latest";

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

/**
 * Retries the AI SDK may take inside one ask: as many as the ask's deadline
 * leaves time for. Its backoff doubles from 2 s and honours `retry-after`;
 * the deadline's abort ends the wait, and the ask is unanswered.
 */
const RETRIES_WITHIN_DEADLINE = Number.MAX_SAFE_INTEGER;

/** "Jev did not answer within N s": an unanswered ask, in every caller's words. */
export const jevUnanswered = (after: number): string =>
  `Jev did not answer within ${secondsOf(after)} s`;

/** An ask's cost as its log line says it: `$<usd>`, or that it is not known. */
export const jevCost = (usage: JevResult["usage"]): string =>
  usage.costUsd === undefined ? "cost not known" : `$${usage.costUsd}`;

/**
 * A failed ask in the route's words, by the AI SDK's error class: the status
 * and body the API answered, or the questions Jev declined. Retries spent
 * are read through to their last failure. Anything else (an abort among
 * them) is thrown as it came.
 */
const failureOf = (route: JevRoute, error: unknown): unknown => {
  if (RetryError.isInstance(error)) {
    return failureOf(route, error.lastError);
  }
  if (APICallError.isInstance(error)) {
    return new Error(
      `${ROUTE_NAME[route]} answered ${error.statusCode ?? "no status"}: ${error.responseBody ?? error.message}`,
      { cause: error }
    );
  }
  if (Experimental_DecisionRefusalError.isInstance(error)) {
    return new Error(
      `${ROUTE_NAME[route]}: Jev declined to answer ${error.questionIds.join(", ")}`,
      { cause: error }
    );
  }
  return error;
};

/**
 * TypeSafe's confidence per question, from the provider's metadata: a
 * number under its question id, each one checked as it is read.
 */
const confidenceOf = (
  metadata: Experimental_DecisionResult<
    Record<string, Experimental_DecisionQuestion>
  >["providerMetadata"]
): Record<string, number> => {
  const given = metadata?.typesafe?.confidence;
  if (typeof given !== "object" || given === null || Array.isArray(given)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(given).flatMap(([id, value]) =>
      typeof value === "number" ? [[id, value]] : []
    )
  );
};

/**
 * Asks every question in one call on `access`'s route, within `timeoutMs`.
 * A throttled or failing-upstream answer (429, 5xx) is asked again with the
 * AI SDK's exponential backoff inside that time; still failing when it runs
 * out is unanswered. Every other failure throws with the route, the status
 * and the body as the API wrote them ({@link failureOf}).
 */
export function askJev<
  const Questions extends Readonly<
    Record<string, Experimental_DecisionQuestion>
  >,
>(
  access: JevAccess,
  state: Experimental_DecisionState,
  questions: Questions,
  options: { timeoutMs: number }
): Promise<Bounded<JevResult<Questions>>> {
  const model = createTypeSafeAi({
    apiKey: access.key,
    ...ROUTE_SETTINGS[access.route],
  }).decisionModel(JEV_MODEL);
  return readWithin(options.timeoutMs, async (deadline) => {
    let result: Experimental_DecisionResult<Questions>;
    try {
      result = await experimental_decide({
        model,
        state,
        questions,
        maxRetries: RETRIES_WITHIN_DEADLINE,
        abortSignal: deadline,
      });
    } catch (error) {
      throw failureOf(access.route, error);
    }
    const { inputTokens, outputTokens } = result.usage;
    const costUsd = costForUsage(
      `typesafe/${JEV_MODEL}`,
      {
        input: inputTokens ?? 0,
        output: outputTokens ?? 0,
        cacheCreation: 0,
        cacheRead: 0,
        reasoning: 0,
      },
      Date.now()
    );
    return {
      model: result.response.modelId,
      answers: result.answers,
      confidence: confidenceOf(result.providerMetadata),
      usage: {
        inputTokens,
        outputTokens,
        ...(costUsd === null || inputTokens === undefined ? {} : { costUsd }),
      },
    };
  });
}
