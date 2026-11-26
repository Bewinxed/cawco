/**
 * The fleet's hooks on Antigravity (core harness/agy.ts `hooks`): the
 * fleet's own and those of the project placed at the session's folder
 * (fleet-harness-set.ts `hooksAt`), read again at each event, so a change
 * reaches a running session. Each command hook runs as Claude Code runs it
 * (fleet-hook-run.ts), handed Claude Code's payload with agy's tools in
 * Claude Code's names (core hooks.ts `hookToolCall`), never agy's own.
 *
 * - `PreToolUse`, on CawCo's one hook in the home (agy-hook.ts), after the
 *   session's judge (agy-judge.ts): a call the judge denies is denied
 *   without them, so the judge answers first; a block denies the call with
 *   its reason; a rewrite is taken outside a workspace alone, and never
 *   over the judge's own rewrite.
 * - `PostToolUse` and `PostToolUseFailure`, on the same hook after the
 *   call, by its `error`. agy 1.5.18 hands a hook no result: no output and
 *   no exit code, and an empty `error` for a command that exited 1 (the
 *   project's `assets/8c459ba3/q2-payloads.txt`), so `tool_response` is
 *   null and only a call agy itself failed is a failure. It takes no words
 *   back from a hook after a call (issue #1138), so what one says is on the
 *   log alone.
 * - `SessionStart`, as CawCo opens the session: what it says goes with the
 *   first prompt.
 * - `UserPromptSubmit`, as CawCo sends a prompt: what it says goes with the
 *   prompt; a block refuses the send.
 * - `Stop`, as a turn ends: a block sends its reason as a prompt that
 *   starts another turn, whose `Stop` hooks are told `stop_hook_active`, as
 *   Claude Code tells them.
 */
import type { HookEvent } from "@cawco/core/hooks";
import { hookToolCall, hookToolInputBack } from "@cawco/core/hooks";
import { Option, Schema } from "effect";
import { hooksAt, readFleetHarnessSet } from "../fleet-harness-set";
import { runFleetHooks } from "../fleet-hook-run";
import { placeSetAt } from "../fleet-place-set";
import {
  type AgyAfterAnswer,
  type AgyAnswer,
  type AgyHookInput,
  type AgySession,
  agyAnswer,
  decodeAgyHookInput,
} from "./agy-judge";

/** agy's tool that calls an MCP tool by its server and name. */
const CALL_MCP_TOOL = "call_mcp_tool";

/** What agy's `PostToolUse` payload says of the call's end: its `error`, empty for one that did not fail. */
const PostToolUseSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
});

const decodePost = Schema.decodeUnknownOption(
  Schema.fromJsonString(PostToolUseSchema)
);

/** The record of an object, or none. */
const recordOf = (
  value: unknown
): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;

/**
 * A call as a fleet hook reads it: Claude Code's name and input keys, and
 * `call_mcp_tool` as the MCP tool it calls, `mcp__<server>__<tool>` with
 * its own arguments, as Claude Code names one.
 */
const claudeCall = (call: AgyHookInput): { input: unknown; name: string } => {
  const { name, args = {} } = call.toolCall;
  if (name === CALL_MCP_TOOL) {
    const server = args.ServerName;
    const tool = args.ToolName;
    if (typeof server === "string" && typeof tool === "string") {
      return {
        name: `mcp__${server}__${tool}`,
        input: recordOf(args.Arguments) ?? {},
      };
    }
  }
  return hookToolCall("agy", name, args);
};

/** A fleet hook's rewrite (Claude Code's keys) in the call's own keys, merged by agy into its args. */
const rewriteOf = (
  call: AgyHookInput,
  input: Record<string, unknown>
): Record<string, unknown> =>
  call.toolCall.name === CALL_MCP_TOOL
    ? { Arguments: input }
    : hookToolInputBack("agy", call.toolCall.name, input);

/** A denial agy reads, its reason the model's. */
const deny = (reason: string): AgyAnswer => ({ decision: "deny", reason });

/** One session's fleet hooks, in its folder `cwd`. */
export class AgyFleetHooks {
  readonly #cwd: string;
  readonly #sessionId: () => string | null;
  /** Ends every hook still running as the session ends. */
  readonly #abort = new AbortController();
  /** What `SessionStart` hooks said, for the session's next prompt. */
  readonly #pending: string[] = [];
  /** The turn running now was started by a `Stop` hook's block. */
  #stopActive = false;

  constructor(cwd: string, sessionId: () => string | null) {
    this.#cwd = cwd;
    this.#sessionId = sessionId;
  }

  async #run(
    event: HookEvent,
    match: string | undefined,
    input: Record<string, unknown>
  ) {
    return await runFleetHooks(
      "agy",
      hooksAt(await readFleetHarnessSet(), await placeSetAt(this.#cwd)),
      event,
      match,
      input,
      {
        cwd: this.#cwd,
        signal: this.#abort.signal,
        sessionId: this.#sessionId() ?? "",
      }
    );
  }

  /**
   * The answer to one line CawCo's hook sent: before a call, the judge's,
   * then the fleet's `PreToolUse` hooks' on a call the judge lets run;
   * after one, `{}` once the fleet's `PostToolUse` hooks have run. A
   * line that is no call agy hands a hook is denied.
   */
  async answer(
    line: string,
    session: AgySession
  ): Promise<AgyAnswer | AgyAfterAnswer> {
    const read = decodeAgyHookInput(line);
    if (Option.isNone(read)) {
      return deny(
        "cawco: this call did not run, because the judge could not read what agy handed its hook."
      );
    }
    const call = read.value;
    if (call.hookEventName === "PostToolUse") {
      await this.#after(call, line);
      return {};
    }
    const judged = agyAnswer(call, session);
    if (judged.decision === "deny") {
      return judged;
    }
    const asked = claudeCall(call);
    const verdict = await this.#run("PreToolUse", asked.name, {
      tool_name: asked.name,
      tool_input: asked.input,
      tool_use_id: call.toolCall.id,
    });
    if (verdict.block) {
      return deny(verdict.block);
    }
    // A workspace's call runs as its judge judged it: no fleet hook's
    // rewrite is taken there (core `hookWorkspaceWords`).
    if (!verdict.updatedInput || session.workspace) {
      return judged;
    }
    return {
      ...judged,
      overwrite: {
        ...rewriteOf(call, verdict.updatedInput),
        ...judged.overwrite,
      },
    };
  }

  /** The fleet's `PostToolUse` or `PostToolUseFailure` hooks, by how the call ended; what they say goes to the log. */
  async #after(call: AgyHookInput, line: string): Promise<void> {
    const ended = Option.getOrUndefined(decodePost(line));
    const error = ended?.error ?? "";
    const failed = error !== "";
    const asked = claudeCall(call);
    const event = failed ? "PostToolUseFailure" : "PostToolUse";
    const verdict = await this.#run(event, asked.name, {
      tool_name: asked.name,
      tool_input: asked.input,
      tool_use_id: call.toolCall.id,
      ...(failed ? { error } : { tool_response: null }),
    });
    const said = [verdict.block, verdict.context].filter(Boolean);
    if (said.length > 0) {
      console.warn(
        `[agy] fleet ${event} hooks on ${asked.name} said, and agy takes no words after a call: ${said.join(" ")}`
      );
    }
  }

  /** The fleet's `SessionStart` hooks, as the session opens: what they say waits for its first prompt. */
  async started(source: "startup" | "resume"): Promise<void> {
    const verdict = await this.#run("SessionStart", source, { source });
    if (verdict.context) {
      this.#pending.push(verdict.context);
    }
  }

  /**
   * The fleet's `UserPromptSubmit` hooks on prompt `text`: why the send is
   * refused, or the words that go with it (what `SessionStart` hooks said
   * first).
   */
  async prompted(
    text: string
  ): Promise<{ readonly refused: string } | { readonly context: string[] }> {
    const verdict = await this.#run("UserPromptSubmit", undefined, {
      prompt: text,
    });
    if (verdict.block) {
      return { refused: verdict.block };
    }
    return {
      context: [...this.#pending.splice(0), verdict.context].filter(
        (said): said is string => Boolean(said)
      ),
    };
  }

  /** The fleet's `Stop` hooks as a turn ends: the reason of a block, which starts another turn. */
  async stopped(): Promise<string | undefined> {
    const active = this.#stopActive;
    this.#stopActive = false;
    const verdict = await this.#run("Stop", undefined, {
      stop_hook_active: active,
    });
    if (verdict.block) {
      this.#stopActive = true;
    }
    return verdict.block;
  }

  /** Every hook still running ended: the session is over. */
  end(): void {
    this.#abort.abort();
  }
}
