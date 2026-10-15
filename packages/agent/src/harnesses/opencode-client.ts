/**
 * One OpenCode 2.0 server as CawCo talks to it: the `@opencode/client`
 * Promise client (pinned with the CLI at core `OPENCODE_VERSION`), its HTTP Basic
 * authentication, how its errors read, and the two checks a server must pass
 * before a session runs in a location there: CawCo's plugin loaded (the gate
 * fails closed), and CawCo's MCP server connected with every other server
 * settled.
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
import { toolBinary } from "../tools";

export type OpencodeClient = OpenCodeClient;

const OPENCODE_TOOL = toolSpec("opencode");
if (!OPENCODE_TOOL) {
  throw new Error("The tool catalog names no OpenCode");
}

/**
 * The OpenCode binary CawCo runs and the one version of it: the tool
 * catalog's (`opencode2`, a name only 2.0's package has; core
 * `OPENCODE_VERSION`, the release `@opencode/client` here is pinned to).
 */
export const OPENCODE_BIN = OPENCODE_TOOL.bin;

/**
 * This machine's OpenCode, found where the tool probe finds it (tools.ts
 * `toolBinary`): `opencode2` on the PATH, a well-known path (Homebrew's
 * 2.0 is only `opencode`, under its formula's own link), or npm's global bin.
 */
export const opencodeBinary = (): Promise<string | undefined> =>
  toolBinary(OPENCODE_TOOL);

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
 * How long a location's plugins may take to load after it boots. 2.0.28
 * answers a location's first `GET /api/plugin` as soon as its built-in
 * services are up, before a configured plugin has loaded (observed: the
 * list without CawCo's plugin, then `loading plugin` in the server's log,
 * then the plugin active ~0.2 s later). Ours: a cold machine's import of the
 * plugin module, with margin.
 */
export const PLUGIN_LOAD_TIMEOUT_MS = 30_000;

/** How long one read of a wait below may take: a read that hangs ends as the wait's own deadline would. */
const WAIT_READ_TIMEOUT_MS = 10_000;

/** `signal`, or the end of one read's {@link WAIT_READ_TIMEOUT_MS}. */
const oneRead = (signal: AbortSignal): AbortSignal =>
  AbortSignal.any([signal, AbortSignal.timeout(WAIT_READ_TIMEOUT_MS)]);

/**
 * The gate, failing closed: a location whose plugin list does not carry
 * CawCo's plugin, active, takes no session. The list is read until the
 * plugin is there (a location just booted lists it a moment later): one
 * that failed to load refuses at once, and one still not there at
 * {@link PLUGIN_LOAD_TIMEOUT_MS} refuses then. A v1 plugin is not loaded at
 * all by 2.0 ("Plugin must export a default definition with an id and an
 * effect or setup function", a warning only), so without this every guard
 * the plugin carries (the workspace judge, the credential stamp, the bounded
 * shell) would be gone while sessions ran on.
 */
export const assertPluginLoaded = async (
  client: OpencodeClient,
  directory: string,
  signal: AbortSignal,
  timeoutMs = PLUGIN_LOAD_TIMEOUT_MS
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next is needed
    const listed = await client.plugin.list(at(directory), {
      signal: oneRead(signal),
    });
    const ours = listed.data.find((plugin) => plugin.id === CAWCO_PLUGIN_ID);
    if (ours?.state.status === "active") {
      return;
    }
    if (ours) {
      const failed = ours.state as { error?: string };
      throw new Error(
        `OpenCode at ${directory} failed to load CawCo's plugin (${CAWCO_PLUGIN_ID}), so it takes no session: ${failed.error ?? ours.state.status}`
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `OpenCode at ${directory} has not loaded CawCo's plugin (${CAWCO_PLUGIN_ID}) within ${timeoutMs / 1000} s, so it takes no session: its workspace judge, credential stamp and bounded shell would not run.`
      );
    }
    await Bun.sleep(250);
  }
};

/**
 * How long a location's MCP servers may take to connect before its first
 * prompt. Ours: OpenCode's own startup timeout per server is 30 s
 * (opencode.ai/v2/docs/mcp-servers "Timeouts", `startup` default), and the
 * servers connect in parallel; one more 30 s covers a cold machine.
 */
export const MCP_CONNECT_TIMEOUT_MS = 60_000;

/** CawCo's own MCP server, as every server's launch config names it (`mcp.servers.cawco`). */
export const CAWCO_MCP_SERVER = "cawco";

/** An MCP server that had not connected when a location took its first prompt, and why. */
export interface McpNotConnected {
  name: string;
  why: string;
}

/**
 * Waits until none of the location's MCP servers is still connecting, and
 * answers the ones that did not connect. A prompt sent while a server is
 * connecting loses its tools: Code Mode's catalog drops them for the turn
 * ("The following tools are no longer available…", anomalyco/opencode#54794
 * and #51812, both open at 2.0.28). So a `pending` server is waited for, up
 * to the deadline.
 *
 * A server that `failed` or `needs_auth` is settled: it is not waited for,
 * and the session runs without its tools, as a Claude session does; so is
 * one still `pending` at the deadline. Each is answered with why, for the
 * session to say. A `disabled` server is nobody's concern.
 *
 * CawCo's own server is the one that must connect: the session's hub tools
 * come through it. One that needs sign-in or is disabled refuses at once;
 * one that failed is dialled again until the deadline, and one not connected
 * at the deadline refuses then, as Claude's harness refuses a launch whose
 * CawCo slot never connects (claude.ts `#connectedCawcoSnapshot`).
 */
export const waitForMcp = async (
  client: OpencodeClient,
  directory: string,
  signal: AbortSignal,
  timeoutMs = MCP_CONNECT_TIMEOUT_MS
): Promise<McpNotConnected[]> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal.throwIfAborted();
    // biome-ignore lint/performance/noAwaitInLoops: each read decides whether the next is needed
    const listed = await client.mcp.list(at(directory), {
      signal: oneRead(signal),
    });
    const cawco = listed.data.find(
      (server) => server.name === CAWCO_MCP_SERVER
    )?.status;
    if (cawco?.status === "needs_auth" || cawco?.status === "disabled") {
      throw new Error(
        `CawCo's MCP server at ${directory} is not connected (${cawco.status}${"error" in cawco ? `: ${cawco.error}` : ""}).`
      );
    }
    const over = Date.now() >= deadline;
    // The hub away (a restart) or slow to answer is no refusal: CawCo's
    // server is dialled again until the deadline, as Claude's launch gate
    // dials its slot (claude.ts `#readCawcoSlot`).
    if (cawco?.status === "failed") {
      if (over) {
        throw new Error(
          `CawCo's MCP server at ${directory} did not connect within ${timeoutMs / 1000} seconds (failed: ${cawco.error}).`
        );
      }
      await client.mcp
        .connect(
          { server: CAWCO_MCP_SERVER, ...at(directory) },
          { signal: oneRead(signal) }
        )
        .catch(() => undefined);
      await Bun.sleep(1000);
      continue;
    }
    const connecting = listed.data.some(
      (server) => server.status.status === "pending"
    );
    if (cawco?.status === "connected" && (over || !connecting)) {
      return listed.data.flatMap((server): McpNotConnected[] => {
        const { status } = server;
        switch (status.status) {
          case "failed":
          case "needs_auth":
            return [{ name: server.name, why: status.error }];
          case "pending":
            return [
              {
                name: server.name,
                why: `still connecting after ${timeoutMs / 1000} s`,
              },
            ];
          default:
            return [];
        }
      });
    }
    if (over) {
      throw new Error(
        `CawCo's MCP server at ${directory} did not connect within ${timeoutMs / 1000} seconds.`
      );
    }
    await Bun.sleep(250);
  }
};
