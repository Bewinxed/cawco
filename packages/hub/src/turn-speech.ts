import { type NeutralAssistantBlock, NO_REPLY_TOOL } from "@cawco/core";
import { CAWCO_TOOL } from "./web-reads";

/** What a turn said by its end, for whoever hears it end. */
export interface TurnWords {
  /** Its last tool call was no_reply_needed. */
  onNoReply: boolean;
  /** Its final message: the text that followed its last tool call. */
  text: string | undefined;
}

/**
 * Each session's final message of the turn in flight: the text frames that
 * followed its last tool call. A tool call empties it, so what came before
 * (narration of work still under way) never reaches the parent. It is a list
 * because Claude emits one frame per content block, so one final message can
 * arrive as several text frames.
 *
 * One rule keeps a turn's words its own: they start empty when the turn
 * starts ({@link began}). A turn that ends with no result (its process died,
 * slept or was stopped inside it, a limit's refusal whose result never came)
 * leaves nothing for the next turn to start with.
 *
 * It also keeps which sessions' turn last called no_reply_needed: ended with
 * no text after that call, the turn has nothing for the person, so its end
 * is no news on any screen (db `noteTurnEnded`) and pushes nothing (push.ts
 * `turnEnded`). On Claude Code and pi the call ends the turn (core
 * no-reply.ts `END_TURN_META`): its tool result is the turn's last frame
 * before a `success` result, with no assistant frame after it.
 */
export const turnSpeech = () => {
  const said = new Map<string, string[]>();
  const endsOnNoReply = new Set<string>();
  const forget = (instanceId: string): void => {
    said.delete(instanceId);
    endsOnNoReply.delete(instanceId);
  };
  return {
    /** A turn of the session starts: it has said nothing yet. */
    began: forget,
    /** A turn's end, whatever ended it: what it said goes. */
    over: forget,
    /**
     * One of the turn's own assistant frames (not a subagent's). Returns its
     * last tool call: one means the turn goes on, and everything said up to
     * it, this frame's own text included, was narration.
     */
    frame(
      instanceId: string,
      content: readonly NeutralAssistantBlock[]
    ): Extract<NeutralAssistantBlock, { type: "tool_use" }> | undefined {
      const lastCall = content.findLast((block) => block.type === "tool_use");
      if (lastCall) {
        said.delete(instanceId);
        // OpenCode's `cawco_` and pi's bare name alike.
        if (lastCall.name.replace(CAWCO_TOOL, "") === NO_REPLY_TOOL) {
          endsOnNoReply.add(instanceId);
        } else {
          endsOnNoReply.delete(instanceId);
        }
        return lastCall;
      }
      const text = content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text) {
        const parts = said.get(instanceId);
        if (parts) {
          parts.push(text);
        } else {
          said.set(instanceId, [text]);
        }
      }
      return undefined;
    },
    /** The turn ended with its result: what it said, then forgotten. */
    ended(instanceId: string): TurnWords {
      const parts = said.get(instanceId);
      const words = {
        text: parts?.length ? parts.join("\n\n") : undefined,
        onNoReply: endsOnNoReply.has(instanceId),
      };
      forget(instanceId);
      return words;
    },
  };
};
