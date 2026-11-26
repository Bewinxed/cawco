import { boundedRead, Unanswered } from "@cawco/core/effect/bounded";
import { Cache, Effect } from "effect";
import { z } from "zod";
import { runPromise, runSync } from "./daemon-runtime";
import { harnessMcpUrl } from "./delegation";
import { fromPromise } from "./rejected";

/** Where every harness on this machine dials a fleet server the hub proxies. */
export const proxiedFleetMcpUrl = (name: string): string =>
  harnessMcpUrl(`/mcp/fleet/${encodeURIComponent(name)}`);

/** One reading serves every session that asks within this long: a heal pass over a machine's sessions reads it once. */
const SHARED_MS = 10_000;
/** How long one reading (its `initialize`, `tools/list` and the session's close) may take: the 30 s each of its two asks had. */
const READING_MS = 60_000;

const post = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
) =>
  fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });

/** A JSON-RPC result off a JSON body or the first `data:` event that carries one. */
const resultOf = async (
  response: Response
): Promise<Record<string, unknown> | undefined> => {
  const text = await response.text();
  const candidates = response.headers
    .get("Content-Type")
    ?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
    : [text];
  for (const candidate of candidates) {
    try {
      const message = z
        .object({ result: z.record(z.string(), z.unknown()).optional() })
        .parse(JSON.parse(candidate));
      if (message.result) {
        return message.result;
      }
    } catch {
      // Not a message: the next line may be.
    }
  }
  return undefined;
};

const count = async (
  name: string,
  signal: AbortSignal
): Promise<number | undefined> => {
  const url = proxiedFleetMcpUrl(name);
  const opened = await post(
    url,
    {},
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "CawCo agent", version: "1" },
      },
    },
    signal
  );
  const init = opened.ok ? await resultOf(opened) : undefined;
  if (!init) {
    await opened.body?.cancel();
    return undefined;
  }
  const session = opened.headers.get("Mcp-Session-Id");
  const headers: Record<string, string> = {
    "MCP-Protocol-Version": String(init.protocolVersion ?? "2025-06-18"),
    ...(session ? { "Mcp-Session-Id": session } : {}),
  };
  try {
    const listed = await post(
      url,
      headers,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
      signal
    );
    const tools = listed.ok ? (await resultOf(listed))?.tools : undefined;
    if (!listed.ok) {
      await listed.body?.cancel();
    }
    return Array.isArray(tools) ? tools.length : undefined;
  } finally {
    if (session) {
      await fetch(url, {
        method: "DELETE",
        headers,
        signal,
      })
        .then((response) => response.body?.cancel())
        .catch(() => undefined);
    }
  }
};

/**
 * How many tools the hub's relay lists for a fleet server it proxies, read
 * the way a session reads them (`initialize`, then `tools/list`, on the path
 * a session dials). The hub answers both from its one upstream listing, so
 * the upstream is not asked again for it. Undefined when it could not be
 * read, or was not answered within {@link READING_MS} (said in the log):
 * nothing is decided on a list nobody saw, and what was decided before stays.
 */
export const proxiedToolCount = (name: string): Promise<number | undefined> =>
  runPromise(Cache.get(readings, name));

/** One reading of `name`'s tools ({@link proxiedToolCount}): what could not be read is undefined. */
const reading = Effect.fnUntraced(function* (name: string) {
  return yield* boundedRead(
    READING_MS,
    fromPromise((signal) => count(name, signal))
  ).pipe(
    Effect.catch((error) =>
      (error instanceof Unanswered
        ? Effect.logWarning(
            `[fleet-mcp] the hub's relay did not list ${name}'s tools within ${READING_MS / 1000} s; nothing is decided on it`
          )
        : Effect.void
      ).pipe(Effect.as<number | undefined>(undefined))
    )
  );
});

/** Each server's last reading, shared by every session that asks while it runs and {@link SHARED_MS} after. */
const readings = runSync(
  Cache.make({
    lookup: reading,
    capacity: Number.POSITIVE_INFINITY,
    timeToLive: SHARED_MS,
  })
);
