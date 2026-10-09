/**
 * TypeSafe's Jev, reached through OpenRouter's System One endpoint — the
 * hub's one Jev client, for meaning rules, suggestions and workflow `w.jev`.
 *
 * One POST answers every question at once against one shared `state`
 * (https://docs.typesafe.ai/patterns/fan-out.md: "All questions are evaluated
 * in parallel"). Plain `fetch`, no SDK:
 * https://openrouter.ai/docs/guides/community/typesafe-sdk — "`jev-latest` is
 * routed as `~typesafe/jev-latest`".
 */
import type {
  JevAnswer,
  JevQuestion,
  JevResult,
  JevText,
} from "@cawco/core/workflow-program";

const SYSTEMONE_URL = "https://openrouter.ai/api/v1/systemone";
/** The first wait before a 429/529 is asked again; it doubles each time. */
const BACKOFF_MS = 500;

interface SystemOneResponse {
  answers: Record<string, JevAnswer>;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cost: number };
}

/**
 * Asks every question in one request. A 429 or 529 is asked again with
 * exponential backoff until `timeoutMs` runs out — the API's documented
 * answer to both ("retry the request with exponential backoff instead of
 * retrying immediately", https://docs.typesafe.ai/api.md). Every other
 * failure throws with the status and the body as the API wrote them.
 */
export async function askJev<
  const Questions extends Readonly<Record<string, JevQuestion>>,
>(
  key: string,
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
    const response = await fetch(SYSTEMONE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bewinxed/cawco",
        "X-OpenRouter-Title": "CawCo",
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
    const failure = `Jev ${response.status}: ${await response.text()}`;
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
