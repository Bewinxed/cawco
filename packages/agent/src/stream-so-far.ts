/**
 * The reply each session is writing, kept whole so far.
 *
 * A harness stores a message once it is written (Claude Code's session JSONL,
 * pi's session file); until then the reply exists only as the partials the
 * agent forwards. While no hub is listening the agent's sink drops them
 * (daemon.ts `supervisor.sink`), and a hub that started since knows the reply
 * only from what streams after it registers: its transcript would draw a
 * running reply from somewhere in its middle. So every partial since the
 * message began is kept here, consecutive deltas joined, and said again as
 * one {@link STREAM_SO_FAR} frame each time the agent registers
 * (`SessionSupervisor.replayStreams`). The hub's transcript draws the running
 * reply from it in place of whatever it painted.
 *
 * What clears a session's partials is what clears them in the hub's
 * transcript (`TranscriptBuilder.foldStream`): the main loop's message
 * written (its `assistant` frame, or its stream's `message_stop`) clears the
 * main loop's; a subagent's clears that subagent's; the turn's `result`
 * clears them all.
 */
import {
  type HarnessKind,
  type NeutralMessage,
  type NeutralStreamMessage,
  type NeutralSystemMessage,
  STREAM_SO_FAR,
} from "@cawco/core";

/** Which loop a frame speaks for: a subagent's Task call, or the main loop (`""`). */
const threadOf = (message: { parent_tool_use_id?: string | null }): string =>
  message.parent_tool_use_id ?? "";

/** `next` joined onto `last` when both are the same kind of delta on the same loop. */
const joined = (
  last: NeutralStreamMessage | undefined,
  next: NeutralStreamMessage
): NeutralStreamMessage | undefined => {
  if (
    !last ||
    threadOf(last) !== threadOf(next) ||
    last.event.type !== "content_block_delta" ||
    next.event.type !== "content_block_delta"
  ) {
    return;
  }
  const a = last.event.delta;
  const b = next.event.delta;
  if (a.type === "text_delta" && b.type === "text_delta") {
    return {
      ...last,
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: a.text + b.text },
      },
    };
  }
  if (a.type === "thinking_delta" && b.type === "thinking_delta") {
    return {
      ...last,
      event: {
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: a.thinking + b.thinking },
      },
    };
  }
};

export class StreamsSoFar {
  readonly #partials = new Map<string, NeutralStreamMessage[]>();
  readonly #harness = new Map<string, HarnessKind>();

  /** One frame a session wrote, kept or clearing what is kept by what it says. */
  note(
    instanceId: string,
    harness: HarnessKind,
    message: NeutralMessage
  ): void {
    if (message.type === "stream_event") {
      const held = this.#partials.get(instanceId) ?? [];
      if (message.event.type === "message_stop") {
        this.#clear(instanceId, held, threadOf(message));
        return;
      }
      const merged = joined(held.at(-1), message);
      if (merged) {
        held[held.length - 1] = merged;
      } else {
        held.push(message);
      }
      this.#partials.set(instanceId, held);
      this.#harness.set(instanceId, harness);
      return;
    }
    if (message.type === "result") {
      this.forget(instanceId);
      return;
    }
    if (message.type === "assistant") {
      this.#clear(
        instanceId,
        this.#partials.get(instanceId) ?? [],
        threadOf(message)
      );
    }
  }

  /** The session's process is gone, or started again: nothing it was writing goes on. */
  forget(instanceId: string): void {
    this.#partials.delete(instanceId);
    this.#harness.delete(instanceId);
  }

  /** Every session's reply so far, one {@link STREAM_SO_FAR} frame each. */
  frames(): {
    harness: HarnessKind;
    instanceId: string;
    message: NeutralSystemMessage;
  }[] {
    return [...this.#partials].flatMap(([instanceId, partials]) => {
      const harness = this.#harness.get(instanceId);
      if (!harness || partials.length === 0) {
        return [];
      }
      const messageId = partials.findLast(
        (partial) => partial.message_id && !partial.parent_tool_use_id
      )?.message_id;
      return [
        {
          instanceId,
          harness,
          message: {
            type: "system",
            subtype: STREAM_SO_FAR,
            partials,
            ...(messageId ? { message_id: messageId } : {}),
          },
        },
      ];
    });
  }

  #clear(instanceId: string, held: NeutralStreamMessage[], thread: string) {
    const kept = held.filter((partial) => threadOf(partial) !== thread);
    if (kept.length === 0) {
      this.forget(instanceId);
    } else {
      this.#partials.set(instanceId, kept);
    }
  }
}
