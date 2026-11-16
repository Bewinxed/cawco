/**
 * GitHub's answer to one Octokit call, whether it made the change or refused
 * it: Octokit throws its answer for any status of 300 or more
 * (@octokit/request-error `RequestError`: its `status` and `response`), and
 * that is read back as an answer here. A failure to reach GitHub is thrown.
 */
import { isRecord } from "@cawco/core/is-record";
import {
  array,
  type InferOutput,
  object,
  optional,
  safeParse,
  string,
} from "valibot";

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
