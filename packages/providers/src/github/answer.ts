/**
 * GitHub's answer to one Octokit call, whether it made the change or refused
 * it: Octokit throws its answer for any status of 300 or more
 * (@octokit/request-error `RequestError`: its `status` and `response`), and
 * that is read back as an answer here. A failure to reach GitHub is thrown.
 */
import {
  array,
  type InferOutput,
  object,
  optional,
  safeParse,
  string,
} from "valibot";

/** Whether `value` is a JSON object (not null, not an array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `text` kept to `max` characters, closing in "…" where it was cut. */
export const cutShort = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** GitHub's answer as Octokit throws it for a status of 300 or more: its status, its body, and its headers (lower-case names). */
export interface OctokitRefusal {
  data: unknown;
  headers: Readonly<Record<string, unknown>>;
  status: number;
}

/** `error` as {@link OctokitRefusal}: undefined for any other failure (GitHub not reached, a request not sent). */
export const refusalOf = (error: unknown): OctokitRefusal | undefined => {
  if (!(
    isRecord(error) &&
    typeof error.status === "number" &&
    isRecord(error.response)
  )) {
    return undefined;
  }
  const { data, headers } = error.response;
  return {
    status: error.status,
    data,
    headers: isRecord(headers) ? headers : {},
  };
};

/** What a GitHub answer's body says in its `message`, when it says one. */
export const messageOf = (data: unknown): string | undefined =>
  isRecord(data) && typeof data.message === "string" ? data.message : undefined;

/** A GraphQL answer's errors, as @octokit/graphql throws them (`GraphqlResponseError.errors`). */
const GraphqlFailureSchema = object({
  errors: array(
    object({
      message: optional(string()),
      type: optional(string()),
    })
  ),
});

/** The errors a GraphQL answer carried, as `error` holds them; none when it is no such answer. */
export const graphqlErrorsOf = (
  error: unknown
): InferOutput<typeof GraphqlFailureSchema>["errors"] => {
  const read = safeParse(GraphqlFailureSchema, error);
  return read.success ? read.output.errors : [];
};

/** GitHub's answer to `call`: what it gave, or the refusal Octokit threw for it. */
export const octokitAnswer = async (
  call: () => Promise<{ data: unknown; status: number }>
): Promise<{ data: unknown; status: number }> => {
  try {
    return await call();
  } catch (error) {
    const refused = refusalOf(error);
    if (refused) {
      return { status: refused.status, data: refused.data };
    }
    throw error;
  }
};

/** An error's HTTP status and headers, as Octokit's RequestError carries them, and its words. */
export const answerOf = (
  error: unknown
): {
  headers: Readonly<Record<string, unknown>>;
  said: string;
  status?: number;
} => {
  const refused = refusalOf(error);
  const failed = isRecord(error) ? error : {};
  return {
    status:
      refused?.status ??
      (typeof failed.status === "number" ? failed.status : undefined),
    headers: refused?.headers ?? {},
    said: cutShort(
      (refused && messageOf(refused.data)) ??
        (typeof failed.message === "string" ? failed.message : ""),
      300
    ),
  };
};

/** GitHub's rate limit on an answer, as when the next request may go; null when it holds nothing back. */
const rateLimited = (
  status: number,
  headers: Readonly<Record<string, unknown>>,
  now: number = Date.now()
): number | null => {
  const retry = Number(headers["retry-after"]);
  const limited =
    (status === 403 || status === 429) &&
    (retry > 0 || String(headers["x-ratelimit-remaining"]) === "0");
  if (!limited) {
    return null;
  }
  const reset = Number(headers["x-ratelimit-reset"]);
  return retry > 0 ? now + retry * 1000 : reset * 1000 || now;
};

/** What kind of refusal {@link refusalWords} found: the hub's problem codes end in it. */
export type RefusalCode =
  "unreachable" | "sign-in" | "rate" | "scope" | "input";

/**
 * What GitHub's error says of `what` on `repo`, in its words and with what
 * the connection needs: its kind, its words, and when its rate limit lets
 * the next request go.
 */
export const refusalWords = (
  error: unknown,
  what: string,
  repo: string
): { code: RefusalCode; resumeAt: number | null; words: string } => {
  const { status, headers, said } = answerOf(error);
  if (status === undefined) {
    return {
      code: "unreachable",
      resumeAt: null,
      words: `GitHub could not be reached to ${what}: ${said}`,
    };
  }
  if (status === 401) {
    return {
      code: "sign-in",
      resumeAt: null,
      words: `GitHub refused the connection's sign-in (401 ${said}).`,
    };
  }
  const resumeAt = rateLimited(status, headers);
  if (resumeAt !== null) {
    return {
      code: "rate",
      resumeAt,
      words: `GitHub's rate limit holds requests back until ${new Date(resumeAt).toISOString()}.`,
    };
  }
  if (status === 403) {
    const needs = headers["x-accepted-github-permissions"];
    return {
      code: "scope",
      resumeAt: null,
      words: `GitHub refused to ${what} on ${repo}: ${said}.${typeof needs === "string" && needs ? ` The connection needs ${needs.replaceAll("=", ": ")} on ${repo} (X-Accepted-GitHub-Permissions: ${needs}).` : ""}`,
    };
  }
  // GitHub answers a request it will not let this connection see the same
  // as one for nothing: "GitHub uses a `404 Not Found` response instead of a
  // `403 Forbidden` response to avoid confirming the existence of private
  // repositories" (docs.github.com/en/rest/using-the-rest-api/
  // troubleshooting-the-rest-api). Which of the two it was is not known here.
  if (status === 404) {
    return {
      code: "scope",
      resumeAt: null,
      words: `GitHub answered 404 to ${what} on ${repo}${said ? `: ${said}` : ""}. GitHub answers 404 both where nothing is at that name and where the connection may not see it: check that ${repo} is spelt as on GitHub, and that the connection's GitHub App is installed on it or its fine-grained token lists it.`,
    };
  }
  return {
    code: "input",
    resumeAt: null,
    words: `GitHub answered ${status} to ${what} on ${repo}${said ? `: ${said}` : ""}.`,
  };
};
