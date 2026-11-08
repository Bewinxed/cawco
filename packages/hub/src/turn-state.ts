import type { NeutralAssistantBlock } from "@cawco/core/harness";
import { NO_REPLY_TOOL } from "@cawco/core/no-reply";
import { CAWCO_TOOL } from "./web-reads";

/** What a turn said by its end, for whoever hears it end. */
export interface TurnWords {
  /** Its last tool call was no_reply_needed. */
  onNoReply: boolean;
  /** Its final message: the text that followed its last tool call. */
  text: string | undefined;
}

/**
 * What each session's turn in flight has said and done, read from its own
 * assistant frames.
 *
 * One rule keeps it the turn's own: it starts empty when the turn starts
 * ({@link began}, server.ts `turnUnderWay`). A turn that ends with no result
 * (its process died, slept or was stopped inside it, a limit's refusal whose
 * result never came) leaves nothing for the next turn to start with.
 *
 * - Its final message: the text frames that followed its last tool call. A
 *   tool call empties it, so what came before (narration of work still under
 *   way) never reaches the parent. It is a list because Claude emits one
 *   frame per content block, so one final message can arrive as several.
 * - Whether its last tool call was no_reply_needed: ended with no text after
 *   that call, the turn has nothing for the person, so its end is no news on
 *   any screen (db `noteTurnEnded`) and pushes nothing (push.ts
 *   `turnEnded`). On Claude Code and pi the call ends the turn (core
 *   no-reply.ts `END_TURN_META`): its tool result is the turn's last frame
 *   before a `success` result, with no assistant frame after it.
 * - Whether it has called a tool: it has done work, which a credential's
 *   refusal never runs again (server.ts `takeCredentialTurn`).
 */
export const turnState = () => {
  const said = new Map<string, string[]>();
  const endsOnNoReply = new Set<string>();
  const worked = new Set<string>();
  const forget = (instanceId: string): void => {
    said.delete(instanceId);
    endsOnNoReply.delete(instanceId);
    worked.delete(instanceId);
  };
  return {
    /** A turn of the session starts: it has said and done nothing yet. */
    began: forget,
    /** A turn's end, whatever ended it: what it said and did goes. */
    over: forget,
    /** Whether the turn in flight has called a tool. */
    worked: (instanceId: string): boolean => worked.has(instanceId),
    /**
     * One of the turn's own assistant frames (not a subagent's). A tool call
     * means the turn goes on: everything said up to it, this frame's own text
     * included, was narration.
     */
    frame(instanceId: string, content: readonly NeutralAssistantBlock[]) {
      const lastCall = content.findLast((block) => block.type === "tool_use");
      if (lastCall) {
        said.delete(instanceId);
        worked.add(instanceId);
        // OpenCode's `cawco_` and pi's bare name alike.
        if (lastCall.name.replace(CAWCO_TOOL, "") === NO_REPLY_TOOL) {
          endsOnNoReply.add(instanceId);
        } else {
          endsOnNoReply.delete(instanceId);
        }
        return;
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
