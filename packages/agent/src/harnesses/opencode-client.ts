/**
 * One OpenCode 2.0 server as CawCo talks to it: the `@opencode/client`
 * Promise client (pinned with the CLI at 2.0.28), its HTTP Basic
 * authentication, how its errors read, and the two checks a server must pass
 * before a session runs in a location there: CawCo's plugin loaded (the gate
 * fails closed), and every configured MCP server connected.
 *
 * 2.0.28's auth: user `opencode`, the password the server was launched with
 * (`OPENCODE_SERVER_PASSWORD`); an unauthenticated call answers 401
 * `{"_tag":"UnauthorizedError"}`. The client throws a declared error as an
 * `Error` named by the server's `_tag` (`SessionNotFoundError`,
 * `FormAlreadySettledError`, …), and a request that never reached the server
 * as a `ClientError` with reason `Transport`.
 */
import { toolSpec } from "@cawco/core";
import { OpenCode, type OpenCodeClient } from "@opencode/client";

export type OpencodeClient = OpenCodeClient;

const opencodeTool = toolSpec("opencode");

/**
 * The OpenCode binary CawCo runs and the one version of it: the tool
 * catalog's (`opencode2`, a name only 2.0's package has; 2.0.28, the release
 * `@opencode/client` here is pinned to).
 */
export const OPENCODE_BIN = opencodeTool?.bin ?? "opencode2";
export const OPENCODE_VERSION = opencodeTool?.exactVersion ?? "2.0.28";

/** Where one server listens and the password it was launched with. */
export interface ServerAddress {
  password: string;
  url: string;
}

/** The id CawCo's v2 plugin registers under (`Plugin.define({ id })`). */
export const CAWCO_PLUGIN_ID = "cawco.context";

/** The `authorization` header a server launched on `password` takes. */
export const basicAuth = (password: string): string =>
  `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;

/** A client for one server; `fetch` lets the harness see a connection fail. */
export const opencodeClient = (
  address: ServerAddress,
  fetchImpl?: typeof fetch
): OpencodeClient =>
  OpenCode.make({
    baseUrl: address.url,
    headers: { authorization: basicAuth(address.password) },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

/** A query's `location`, as every location-scoped read takes it. */
export const at = (directory: string): { location: { directory: string } } => ({
  location: { directory },
});

/** The server's `_tag` for a declared error (`SessionNotFoundError`, …), or the client's reason. */
export const errorTag = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) {
    return;
  }
  const { reason } = error as { reason?: unknown };
  if (error.name === "ClientError" && typeof reason === "string") {
    return reason;
  }
  return error.name;
};

/** The request never reached the server: refused, reset, timed out or aborted on the way. */
export const unreachable = (error: unknown): boolean =>
  errorTag(error) === "Transport";

/** The status a server answered outside what its route declares, if that is what this is. */
const unexpectedStatus = (error: unknown): number | undefined => {
  const cause = (error as { cause?: { status?: unknown } } | undefined)?.cause;
  return errorTag(error) === "UnexpectedStatus" &&
    typeof cause?.status === "number"
    ? cause.status
    : undefined;
};

/** The server holds no such thing (a session, a message, a form, a location). */
export const notFound = (error: unknown): boolean =>
  (errorTag(error) ?? "").endsWith("NotFoundError") ||
  unexpectedStatus(error) === 404;

/**
 * An error in its own words, whole: a structured session error
 * (`{type, message, status?}`, `Session.StructuredError`) reads as
 * `type status: message`; anything thrown reads as `name: message`.
 */
export const errorText = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && !(error instanceof Error)) {
    const structured = error as {
      type?: unknown;
      message?: unknown;
      status?: unknown;
    };
    if (typeof structured.message === "string") {
      const kind = typeof structured.type === "string" ? structured.type : "";
      const status =
        typeof structured.status === "number" ? ` ${structured.status}` : "";
      return `${kind}${status}${kind || status ? ": " : ""}${structured.message}`;
    }
    return JSON.stringify(error);
  }
  if (!(error instanceof Error)) {
    return String(error);
  }
  const status = unexpectedStatus(error);
  const cause =
    error.cause && error.cause !== error && !status
      ? `; cause: ${errorText(error.cause)}`
      : "";
  return `${error.name}${status ? ` ${status}` : ""}: ${error.message}${cause}`;
};

/**
 * The gate, failing closed: a location whose plugin list does not carry
 * CawCo's plugin, active, takes no session. A v1 plugin is not loaded at all
 * by 2.0 ("Plugin must export a default definition with an id and an effect
 * or setup function", a warning only), so without this every guard the
 * plugin carries (the workspace judge, the credential stamp, the bounded
 * shell) would be gone while sessions ran on.
 */
export const assertPluginLoaded = async (
  client: OpencodeClient,
  directory: string,
  signal: AbortSignal
): Promise<void> => {
  const listed = await client.plugin.list(at(directory), { signal });
  const ours = listed.data.find((plugin) => plugin.id === CAWCO_PLUGIN_ID);
  if (!ours) {
    throw new Error(
      `OpenCode at ${directory} has not loaded CawCo's plugin (${CAWCO_PLUGIN_ID}), so it takes no session: its workspace judge, credential stamp and bounded shell would not run.`
    );
  }
  if (ours.state.status !== "active") {
    const failed = ours.state as { error?: string };
    throw new Error(
      `OpenCode at ${directory} failed to load CawCo's plugin (${CAWCO_PLUGIN_ID}), so it takes no session: ${failed.error ?? ours.state.status}`
    );
  }
};

/**
 * How long a location's MCP servers may take to connect before its first
 * prompt. Ours: OpenCode's own startup timeout per server is 30 s
 * (opencode.ai/v2/docs/mcp-servers "Timeouts", `startup` default), and the
 * servers connect in parallel; one more 30 s covers a cold machine.
 */
export const MCP_CONNECT_TIMEOUT_MS = 60_000;

/**
 * Waits until every MCP server the location has configured is `connected`.
 * A prompt sent before then loses the tools of a server still connecting:
 * Code Mode's catalog drops them for the turn ("The following tools are no
 * longer available…", anomalyco/opencode#54794 and #51812, both open at
 * 2.0.28). A server that fails, needs auth, or is still pending at the
 * deadline ends the wait with its name and why. A disabled server is not
 * waited for.
 */
export const waitForMcp = async (
  client: OpencodeClient,
  directory: string,
  signal: AbortSignal,
  timeoutMs = MCP_CONNECT_TIMEOUT_MS
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal.throwIfAborted();
    // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next is needed
    const listed = await client.mcp.list(at(directory), { signal });
    const waiting = listed.data.filter(
      (server) =>
        server.status.status !== "connected" &&
        server.status.status !== "disabled"
    );
    if (waiting.length === 0) {
      return;
    }
    const broken = waiting.find(
      (server) =>
        server.status.status === "failed" ||
        server.status.status === "needs_auth"
    );
    if (broken || Date.now() >= deadline) {
      const named = (broken ? [broken] : waiting)
        .map((server) => {
          const status = server.status as { status: string; error?: string };
          return `${server.name} (${status.status}${status.error ? `: ${status.error}` : ""})`;
        })
        .join(", ");
      throw new Error(
        broken
          ? `OpenCode's MCP server ${named} at ${directory} did not connect.`
          : `OpenCode's MCP servers ${named} at ${directory} were still not connected after ${timeoutMs / 1000} s.`
      );
    }
    await Bun.sleep(250);
  }
};
