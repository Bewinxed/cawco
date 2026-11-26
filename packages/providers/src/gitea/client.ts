/**
 * Gitea's client: gitea-mcp, "Gitea's official MCP Server"
 * (gitea.com/gitea/gitea-mcp), built on Gitea's official Go SDK, which
 * TypeScript cannot call; the one TypeScript client, gitea-js, stops at
 * Gitea 1.23 (docs/forge-adapters.md §2). The client is one tool caller
 * (provider spec §2.3, `Credential` kind `mcp`): the hub's is a `gitea`
 * connection's own tools (hub connections.ts `giteaClient`), a machine's
 * starts the host's `gitea-mcp` signed in as tea's login (agent
 * forges/gitea-sign-in.ts).
 *
 * Every tool answers its result as JSON text ("TextResult", gitea-mcp's
 * internal/to), or an error result in its words: {@link giteaJson} is one
 * call as an Effect within the hub's deadline, its answer parsed.
 */
import { Effect } from "effect";
import { quote } from "../quote";
import {
  type ProviderFailure,
  type RefusalKind,
  refusedWith,
  request,
} from "../read-stop";

/** What one gitea-mcp tool answered: its text parts, and whether it is an error. */
export interface GiteaAnswer {
  content: readonly ({ text: string; type: "text" } | { type: string })[];
  isError?: boolean;
}

/** One gitea-mcp tool called with its arguments. */
export type McpToolCaller = (
  tool: string,
  args: Record<string, unknown>
) => Promise<GiteaAnswer>;

/** A client signed in to one Gitea host. */
export interface GiteaClient {
  call: McpToolCaller;
}

/** The gitea-mcp tools a machine's writes call, and no others are listed to it. */
export const GITEA_TOOLS = [
  "get_me",
  "issue_read",
  "issue_write",
  "pull_request_write",
  "pull_request_read",
] as const;

/** What an event route's source pattern matches of a repository: `gitea:<owner>/<repo>` on gitea.com, `gitea:<host>/<owner>/<repo>` elsewhere. */
export const giteaSource = (host: string, repo: string): string =>
  `gitea:${host === "gitea.com" ? "" : `${host}/`}${repo.toLowerCase()}`;

/** `owner/repo` as gitea-mcp names them. */
export const repoArgs = (path: string) => {
  const [owner = "", repo = ""] = path.split("/");
  return { owner, repo };
};

/** A tool's answer's text, its parts joined. */
const textOf = (answer: GiteaAnswer): string =>
  answer.content
    .map((part) => ("text" in part && part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();

/**
 * What gitea-mcp says when Gitea answered the request with nothing there:
 * its REST helper's `request failed with status 404`, the Go SDK's
 * passing-on of Gitea's own message (`The target couldn't be found.`, a
 * model's `… does not exist`).
 */
const GONE_WORDS =
  /status 404|404 not found|couldn't be found|does not exist|not found/iu;

const SIGN_IN_WORDS =
  /status 401|401 unauthorized|token is required|invalid token/iu;
const RATE_WORDS = /status 429|rate limit/iu;
const SCOPE_WORDS = /status 403|forbidden|status 404|couldn't be found/iu;

/** What kind of refusal a tool's error words say, by the status gitea-mcp's helpers name in them. */
const kindOf = (said: string): RefusalKind => {
  if (SIGN_IN_WORDS.test(said)) {
    return "sign-in";
  }
  if (RATE_WORDS.test(said)) {
    return "rate";
  }
  return SCOPE_WORDS.test(said) ? "scope" : "input";
};

/**
 * One gitea-mcp tool called within `requestMs`: its answer's JSON; an error
 * result in its words as a refusal of the kind its words say, Gitea's 404
 * among them.
 */
export const giteaJson = (
  client: GiteaClient,
  tool: string,
  args: Record<string, unknown>,
  requestMs: number
): Effect.Effect<unknown, ProviderFailure> =>
  giteaAnswer(client, tool, args, requestMs).pipe(
    Effect.flatMap((answer) => {
      if (answer === GONE) {
        return Effect.fail(
          refusedWith(`gitea-mcp's ${tool}: not found on Gitea.`, "scope")
        );
      }
      return Effect.succeed(answer);
    })
  );

/** What {@link giteaAnswer} answers for Gitea's 404. */
export const GONE = Symbol("gone");

/** One tool called within `requestMs`: its answer's JSON, or {@link GONE} for Gitea's 404; any other error result is a refusal in its words. */
export const giteaAnswer = (
  client: GiteaClient,
  tool: string,
  args: Record<string, unknown>,
  requestMs: number
): Effect.Effect<unknown, ProviderFailure> =>
  request(
    "gitea-mcp",
    requestMs,
    () => client.call(tool, args),
    (error) =>
      refusedWith(
        `Could not call gitea-mcp's ${tool}: ${error instanceof Error ? error.message : String(error)}`,
        "unreachable"
      )
  ).pipe(
    Effect.flatMap((answer) => {
      const said = textOf(answer);
      if (answer.isError) {
        return GONE_WORDS.test(said)
          ? Effect.succeed<unknown>(GONE)
          : Effect.fail(
              refusedWith(
                `gitea-mcp's ${tool}: ${said || "failed"}`,
                kindOf(said)
              )
            );
      }
      try {
        return Effect.succeed<unknown>(JSON.parse(said));
      } catch {
        return Effect.fail(
          refusedWith(`gitea-mcp's ${tool} didn't return JSON: ${quote(said)}`)
        );
      }
    })
  );
