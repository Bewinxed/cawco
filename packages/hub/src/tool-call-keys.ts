/**
 * THE ONCE-PER-KEY RULE. A machine's gateway sends each tool call it relays
 * to the hub under one idempotency key, the same on every resend (agent
 * mcp-oauth.ts `relayMcp`), and sends it again whenever the link drops
 * before the answer is through (hub-away.ts). Here a key seen before is
 * never run again: one still running is answered that call's answer as it
 * comes, from its first byte; one answered is answered the same bytes; one
 * the hub's last process was running when it ended is answered that it was
 * not run again. The agent's record of what the hub asks of it is the same
 * shape the other way (agent request-record.ts).
 *
 * A key is the caller's: it is kept hashed with the caller's credential and
 * the route, so no other caller and no other route meets it (IETF
 * draft-ietf-httpapi-idempotency-key-header-07 §5: "a composite key MAY be
 * implemented by combining the idempotency key sent by the client with other
 * client specific attributes known only to the resource"). Where the draft
 * answers a key still running 409 (§2.6), here it is answered the call's own
 * answer, once there is one: the resend is the same caller still waiting.
 *
 * Kept in the hub's database (`tool_call_keys`), so a restart of the hub
 * still knows what it ran, whole answers included, for
 * {@link TOOL_CALL_KEY_KEPT_MS} past each key's answer; a key running is
 * kept as long as it runs.
 */
import { createHash } from "node:crypto";
import { TOOL_CALL_KEY_HEADER } from "@cawco/core/binary-updates";
import type { ToolCallKeysDb } from "./db/tool-call-keys";
import type { HubLifetimeShape } from "./lifetime";

/**
 * How long an answered key is kept. Ours: a gateway sends a call again only
 * while the hub is away, for at most 90 s from the drop (agent hub-away.ts
 * `HUB_AWAY_BOUND_MS`); ten minutes is that with room, a hub restart's
 * outage (30.5 s measured on 2026-10-09) inside it.
 */
export const TOOL_CALL_KEY_KEPT_MS = 10 * 60_000;
/** How often what is past {@link TOOL_CALL_KEY_KEPT_MS} goes. */
const PRUNE_EVERY_MS = 60_000;

/** What a key's caller is told when the hub's last process was running its call as it ended. */
export const INTERRUPTED_CALL =
  "The hub restarted while it was running this tool call, so it was not run again and whether it finished is not known; look at what it did before calling it again.";

/** A tool's result that says `words`, as the REST door answers a call. */
export const toolResultRefused = (words: string): Response =>
  Response.json({ isError: true, content: [{ type: "text", text: words }] });

/** The same result as MCP answers it: under the id of the `tools/call` in `body`. */
export const mcpRefused = (body: unknown, words: string): Response => {
  const call = (Array.isArray(body) ? body : [body]).find(
    (message: { method?: unknown } | null | undefined) =>
      message?.method === "tools/call"
  ) as { id?: unknown } | undefined;
  return Response.json({
    jsonrpc: "2.0",
    id: call?.id ?? null,
    result: { isError: true, content: [{ type: "text", text: words }] },
  });
};

/** A call running in this process under its key: its answer so far, for every asker. */
interface Running {
  chunks: Uint8Array[];
  ended: boolean;
  head: PromiseWithResolvers<{ headers: [string, string][]; status: number }>;
  /** Settles when a chunk comes or the answer ends. */
  moved: PromiseWithResolvers<void>;
}

/** Statuses whose response carries no body (Fetch: "null body status"). */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

const moved = (running: Running): void => {
  const was = running.moved;
  running.moved = Promise.withResolvers();
  was.resolve();
};

/** A running call's answer, from its first byte, as it comes. */
const follow = async (running: Running): Promise<Response> => {
  const { status, headers } = await running.head.promise;
  if (NULL_BODY.has(status)) {
    return new Response(null, { status, headers });
  }
  let next = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (next >= running.chunks.length && !running.ended) {
          // biome-ignore lint/performance/noAwaitInLoops: waits for the call's next chunk.
          await running.moved.promise;
        }
        const chunk = running.chunks[next];
        if (chunk) {
          next += 1;
          controller.enqueue(chunk);
        } else {
          controller.close();
        }
      },
    }),
    { status, headers }
  );
};

const joined = (chunks: Uint8Array[]): Uint8Array => {
  const whole = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  );
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return whole;
};

export const createToolCallKeys = ({
  db,
  lifetime,
}: {
  db: ToolCallKeysDb;
  lifetime: HubLifetimeShape;
}) => {
  const cut = db.interrupt();
  if (cut > 0) {
    console.info(
      `[tool-call-keys] ${cut} tool call(s) the last hub process was running as it ended will be answered that they were not run again`
    );
  }
  const prune = () => db.prune(Date.now() - TOOL_CALL_KEY_KEPT_MS);
  prune();
  lifetime.every(PRUNE_EVERY_MS, prune);

  const live = new Map<string, Running>();

  /**
   * The answer's every byte read as it comes, whoever asks or stops asking,
   * then kept with the key: the call's answer is read to its end even when
   * its first asker's link dropped.
   */
  const keep = async (
    id: string,
    running: Running,
    response: Response
  ): Promise<void> => {
    const headers = [...response.headers].filter(
      ([name]) => name.toLowerCase() !== "content-length"
    );
    running.head.resolve({ status: response.status, headers });
    try {
      if (response.body) {
        for await (const chunk of response.body) {
          running.chunks.push(chunk);
          moved(running);
        }
      }
    } catch (error) {
      console.warn(
        `[tool-call-keys] a keyed call's answer broke off at the hub: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    running.ended = true;
    moved(running);
    try {
      db.answer(
        id,
        { status: response.status, headers, body: joined(running.chunks) },
        Date.now()
      );
    } finally {
      live.delete(id);
    }
  };

  /**
   * The answer kept with key `id`, as it was first sent; undefined when it
   * has none (the hub's last process was running it as it ended).
   */
  const kept = (id: string, path: string): Response | undefined => {
    const row = db.get(id);
    if (row?.state !== "answered" || row.status === null) {
      return undefined;
    }
    console.info(
      `[tool-call-keys] ${path} sent again once answered: its first answer, not run again`
    );
    return new Response(
      NULL_BODY.has(row.status) || !row.body ? null : new Uint8Array(row.body),
      { status: row.status, headers: row.headers ?? [] }
    );
  };

  /**
   * `run`'s answer to `request`, with `run` run once per key however often
   * the key comes ({@link TOOL_CALL_KEY_HEADER}); a request with no key, or
   * no POST, is simply run. `refused` is the route's answer, in its own
   * shape, when a key's call was cut by a hub restart.
   */
  const once = async (
    request: Request,
    run: () => Promise<Response>,
    refused: (words: string) => Response
  ): Promise<Response> => {
    const key = request.headers.get(TOOL_CALL_KEY_HEADER);
    if (!key || request.method !== "POST") {
      return await run();
    }
    const url = new URL(request.url);
    const id = createHash("sha256")
      .update(
        [
          request.headers.get("authorization") ?? "",
          `${url.pathname}${url.search}`,
          key,
        ].join("\n")
      )
      .digest("hex");
    const already = live.get(id);
    if (already) {
      console.info(
        `[tool-call-keys] ${url.pathname} sent again while it runs: answered as it answers`
      );
      return await follow(already);
    }
    if (!db.take(id, Date.now())) {
      return kept(id, url.pathname) ?? refused(INTERRUPTED_CALL);
    }
    const running: Running = {
      chunks: [],
      ended: false,
      head: Promise.withResolvers(),
      moved: Promise.withResolvers(),
    };
    live.set(id, running);
    let response: Response;
    try {
      response = await run();
    } catch (error) {
      response = new Response(
        error instanceof Error ? error.message : String(error),
        { status: 500 }
      );
    }
    keep(id, running, response).catch((error: unknown) =>
      console.warn(
        `[tool-call-keys] a keyed call's answer was not kept: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return await follow(running);
  };

  return { once };
};

export type ToolCallKeys = ReturnType<typeof createToolCallKeys>;
