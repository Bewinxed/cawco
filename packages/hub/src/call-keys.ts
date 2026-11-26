/**
 * THE ONCE-PER-CALL RULE for the tools that start or send something
 * (decision page workflows-future: "A delegate, handoff or page call carries
 * a key, so a turn retried after a cut finds the item it already started").
 * A `delegate`, `handoff`, `artifact_create` or `project_create` call that carries its
 * harness's key for the call runs once per calling session and key: a call
 * that comes again under the same key while the first runs is answered that
 * call's answer as it comes, and once answered, the same answer, with no
 * second item, message or page made. The workflow engine replayed a step the
 * same way (20d367743); here it is these four calls.
 *
 * The key is what each harness sends again when it retries a call:
 * - Claude Code names every MCP `tools/call` by its tool_use id in `_meta`
 *   (`"claudecode/toolUseId"`), and after a connection lost mid-call takes
 *   it again and retries the call once, under the same tool use
 *   (`callMCPToolWithUrlElicitationRetry`, src/services/mcp/client.ts, read
 *   at https://cc.windliang.wang/10-mcp-and-dynamic-tool-discovery.html:
 *   "连接在执行期间失效时 … 会重新取得连接并最多重试一次").
 * - OpenCode names no call: its `_meta` carries the session alone
 *   (`"ai.opencode/sessionID"`, https://opencode.ai/v2/docs/mcp-servers),
 *   and its retry after an expired session replays the same `tools/call`
 *   once (anomalyco/opencode#25137, fixed by #32088: "rebuilds the
 *   transport and replays the call once"). What it sends again is that
 *   session and the same arguments, so they are its key.
 * - pi names each call by its `toolCallId`, which CawCo's pi runtime sends
 *   with the call to the hub's tool door (agent delegation.ts
 *   `callDelegationTool`).
 *
 * Kept with the relayed calls' keys (`tool_call_keys`, tool-call-keys.ts),
 * which prunes them `TOOL_CALL_KEY_KEPT_MS` after their answer and
 * marks those a stopped hub was running as interrupted.
 */
import { createHash } from "node:crypto";
import { makeJoin } from "@cawco/core/effect/join";
import {
  type CallToolResult,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Effect } from "effect";
import type { ToolCallKeysDb } from "./db/tool-call-keys";
import type { HubLifetimeShape } from "./lifetime";
import { INTERRUPTED_CALL } from "./tool-call-keys";

/** The tools a key makes run once: each starts work or sends words that a second run would double. */
const KEYED_TOOLS: ReadonlySet<string> = new Set([
  "delegate",
  "handoff",
  "artifact_create",
  // A second run would make a second project (project-create.ts).
  "project_create",
]);

/** Where Claude Code names a call's tool use in `tools/call`'s `_meta`. */
export const CLAUDE_CALL_META = "claudecode/toolUseId";
/** Where OpenCode names the calling session in `tools/call`'s `_meta`. */
const OPENCODE_SESSION_META = "ai.opencode/sessionID";

/**
 * The key a `tools/call`'s `_meta` gives the call: Claude Code's tool use,
 * else OpenCode's session with the call's own name and arguments. None
 * when the harness named neither.
 */
export const mcpCallKey = (
  meta: Record<string, unknown> | undefined,
  name: string,
  args: Record<string, unknown>
): string | undefined => {
  const toolUse = meta?.[CLAUDE_CALL_META];
  if (typeof toolUse === "string" && toolUse) {
    return `claude:${toolUse}`;
  }
  const session = meta?.[OPENCODE_SESSION_META];
  if (typeof session === "string" && session) {
    const asked = createHash("sha256")
      .update(JSON.stringify([name, args]))
      .digest("hex");
    return `opencode:${session}:${asked}`;
  }
  return undefined;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A call's failure as the answer its caller reads. */
const failedAnswer = (error: unknown): CallToolResult => ({
  isError: true,
  content: [
    {
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    },
  ],
});

export const createCallKeys = ({
  db,
  lifetime,
}: {
  db: ToolCallKeysDb;
  lifetime: Pick<HubLifetimeShape, "run">;
}) => {
  /**
   * Each keyed call this process runs now, by its stored id: a call sent
   * again while it runs joins it. What outlives the run is its row.
   */
  const live = makeJoin<string, CallToolResult>();

  /**
   * The keyed call `id` the first time it comes: run, and its answer kept
   * on its row; one whose row was taken before (by a run that ended, or a
   * hub that stopped) answers what the row holds.
   */
  const firstRun = (
    id: string,
    instanceId: string,
    name: string,
    run: () => Promise<CallToolResult>
  ): Effect.Effect<CallToolResult> =>
    Effect.gen(function* () {
      if (!db.take(id, Date.now())) {
        const row = db.get(id);
        if (row?.state === "answered" && row.body) {
          console.info(
            `[call-keys] ${name} from ${instanceId} sent again once answered: its first answer, not run again`
          );
          return CallToolResultSchema.parse(
            JSON.parse(decoder.decode(row.body))
          );
        }
        return {
          isError: true,
          content: [{ type: "text", text: INTERRUPTED_CALL }],
        } satisfies CallToolResult;
      }
      const result = yield* Effect.tryPromise({
        try: run,
        catch: (error) => error,
      }).pipe(Effect.catch((error) => Effect.succeed(failedAnswer(error))));
      db.answer(
        id,
        {
          status: 200,
          headers: [],
          body: encoder.encode(JSON.stringify(result)),
        },
        Date.now()
      );
      return result;
    });

  return {
    /**
     * `run`'s answer, run once per `instanceId`, `name` and `key`; a tool
     * outside {@link KEYED_TOOLS}, or a call with no key, is simply run.
     * The promise edge of the join.
     */
    async once(
      instanceId: string | null,
      name: string,
      key: string | undefined,
      run: () => Promise<CallToolResult>
    ): Promise<CallToolResult> {
      if (!(instanceId && key && KEYED_TOOLS.has(name))) {
        return await run();
      }
      const id = createHash("sha256")
        .update(["session-call", instanceId, name, key].join("\n"))
        .digest("hex");
      // The join starts a run on the caller's own turn: one that did not
      // start here joined the run in flight.
      let started = false;
      const answer = lifetime.run(
        live.run(
          id,
          Effect.suspend(() => {
            started = true;
            return firstRun(id, instanceId, name, run);
          })
        )
      );
      if (!started) {
        console.info(
          `[call-keys] ${name} from ${instanceId} sent again while it runs: answered as it answers`
        );
      }
      return await answer;
    },
  };
};

export type CallKeys = ReturnType<typeof createCallKeys>;
