/**
 * The CawCo tool a turn with nothing for the person ends on, its name Claude
 * Code's own for the same act (its Remote Control bridge's `no_reply_needed`).
 * Only a session that talks with the person has it (hub roles.ts
 * `talksWithPerson`); it does nothing on the hub but refuse while the person's
 * message waits for its reply ({@link NO_REPLY_OWED}), and it counts as no
 * work and no repeat (hub work-items.ts `restsInWait`, fleet-watch.ts
 * `neverRepeats`).
 *
 * A module of its own: injected.ts, whose presence line names it, loads while
 * harness.ts does, so importing delegate-types.ts there runs that module's top
 * level before `HARNESSES` exists.
 */
export const NO_REPLY_TOOL = "no_reply_needed";

/**
 * {@link NO_REPLY_TOOL}'s refusal while the person's last message to the
 * session, which it has read, has no reply after it (hub db
 * `personUnanswered`).
 */
export const NO_REPLY_OWED =
  "Refused: the person's last message has no reply yet. Answer them in this turn's closing words.";

/**
 * The mark on a tool result that ends the turn at the call: the model takes
 * no further step, so nothing can be written after it. The hub sets it on
 * {@link NO_REPLY_TOOL}'s result (hub mcp-tool.ts `endsTurn`), and each
 * harness reads it with its own primitive:
 *
 * - Claude Code reads it off an MCP result's `_meta`. 2.1.311's bundle:
 *   `var gH="claude/endTurn"…function b7t(e){if(e?._meta?.[gH]!==!0)return!1;
 *   …return"mcp_meta"}`, and its query loop, after the tool batch,
 *   `if(ve.toolRequestedEndTurn&&!Mn&&!ta)return yield*kg({endTurnSource:…
 *   "mcp_meta",…}),{reason:"completed"}` with no further model request. The
 *   Agent SDK names it: "any MCP tool using `_meta['claude/endTurn']`: a
 *   completed turn there ends on a successful tool_result carrier — with no
 *   trailing assistant message" (claude-agent-sdk 0.3.310 sdk.d.ts).
 * - pi has no MCP here: CawCo's tools are its own (agent pi-runtime.ts), and
 *   the call answers `terminate: true` when the hub's result carries the mark
 *   (agent delegation.ts `callDelegationTool`). pi-agent-core 1.4.0
 *   agent-loop.js: `hasMoreToolCalls = !executedToolBatch.terminate;`, where
 *   a batch terminates when "finalizedCalls.every((finalized) =>
 *   finalized.result.terminate === true)".
 * - OpenCode 2.0.29 has no such primitive: its runner continues after any
 *   step that called a tool, `needsContinuation:BLe(u.values(),(ge)=>
 *   !ge.providerExecuted&&(ge.called||ge.settled))`, and no plugin hook
 *   (opencode.ai/v2/docs/build/plugins/server) ends the loop short of
 *   interrupting the session. The same at v2.2.5
 *   (anomalyco/opencode/packages/core/src/session/runner/publish-llm-event.ts:
 *   `needsContinuation: Iterable.some(tools.values(), (tool) =>
 *   !tool.providerExecuted && (tool.called || tool.settled))`). So the
 *   tool's words there ask for no text after the call (hub
 *   delegation-tools.ts `NO_REPLY_WORDS`).
 */
export const END_TURN_META = "claude/endTurn";
