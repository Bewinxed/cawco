/**
 * What each session said just before a call it makes, for its ask's head
 * (core permission-presentation.ts `PresentationContext.said`): an ask whose
 * input gives no reason reads the session's own stated intent instead ("I'll
 * give the label its own component" → "needs to give the label its own
 * component").
 *
 * Fed every admitted frame but stream deltas, in order. A reply's last text
 * is kept under each call it makes after it; a tool result or a new prompt
 * (a user-role frame) ends what was said, so a later call in the same turn
 * that says nothing first is read by nothing stale. A turn's end drops the
 * session's whole account: an ask is parked before its turn ends.
 */
import type { NeutralMessage } from "@cawco/core";

/** Calls kept per session: a reply's calls are asked about within it. */
const CALLS_KEPT = 16;

interface Heard {
  /** Each call by its id, with the text said just before it. */
  calls: Map<string, string>;
  /** The reply's last text so far, until a user-role frame ends it. */
  text?: string;
}

export interface AskIntentShape {
  /** One admitted frame of the session's. */
  readonly frame: (instanceId: string, message: NeutralMessage) => void;
  /**
   * What the session said just before the call `toolUseId`; without one (or
   * a call not heard yet), its reply's last text so far.
   */
  readonly said: (
    instanceId: string,
    toolUseId: string | undefined
  ) => string | undefined;
}

export const createAskIntent = (): AskIntentShape => {
  const sessions = new Map<string, Heard>();

  const heardOf = (instanceId: string): Heard => {
    const known = sessions.get(instanceId);
    if (known) {
      return known;
    }
    const heard: Heard = { calls: new Map() };
    sessions.set(instanceId, heard);
    return heard;
  };

  /** A reply's blocks: its last text so far, kept under each call made after it. */
  const spoke = (
    instanceId: string,
    message: Extract<NeutralMessage, { type: "assistant" }>
  ): void => {
    const heard = heardOf(instanceId);
    for (const block of message.message.content) {
      if (block.type === "text" && block.text.trim()) {
        heard.text = block.text;
      } else if (block.type === "tool_use" && heard.text) {
        heard.calls.set(block.id, heard.text);
        const [oldest] = heard.calls.keys();
        if (heard.calls.size > CALLS_KEPT && oldest !== undefined) {
          heard.calls.delete(oldest);
        }
      }
    }
  };

  const frame: AskIntentShape["frame"] = (instanceId, message) => {
    // A subagent's own words are not its session's reason.
    if ("parent_tool_use_id" in message && message.parent_tool_use_id) {
      return;
    }
    if (message.type === "result") {
      sessions.delete(instanceId);
    } else if (message.type === "user") {
      const heard = sessions.get(instanceId);
      if (heard) {
        heard.text = undefined;
      }
    } else if (message.type === "assistant") {
      spoke(instanceId, message);
    }
  };

  return {
    frame,
    said: (instanceId, toolUseId) => {
      const heard = sessions.get(instanceId);
      if (!heard) {
        return;
      }
      return (toolUseId ? heard.calls.get(toolUseId) : undefined) ?? heard.text;
    },
  };
};
