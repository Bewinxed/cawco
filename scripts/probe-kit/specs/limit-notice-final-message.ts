/**
 * A session's turn holds only its own words and work: the "You've hit your
 * limit" notice of a turn its account's limit refused never starts the next
 * turn's final message, and the work of a turn that died with no result
 * never stops the next turn's credential refusal from running it again.
 *
 * Claude Code ends a refused turn with an assistant frame (`error:
 * "rate_limit"`) whose text is the notice, then the turn's `result`. The hub
 * (server.ts) keeps each turn's words and work in turn-state.ts `turnState`:
 * every top-level assistant frame goes to `frame`; a turn's start (server.ts
 * `turnUnderWay`, its first frame or its harness reading a send, ahead of
 * any refusal that frame carries) to `began`; a result the at-limit controller answers, a credential's turn
 * and a result the hub took already to `over`; any other result to `ended`,
 * which gives the final message handed up. Driven here in that order:
 *
 * - (answered) a refused turn whose result the at-limit controller answers
 *   (`over`), then a normal turn: its final message is the normal words.
 * - (no result) a refused turn whose result never comes (its process gone
 *   inside the turn), then a normal turn: its final message is the normal
 *   words. The turn's start is what holds it: without `began`, the notice
 *   would lead it.
 * - (its own) a refused turn the controller doesn't answer ends with its
 *   own words: the notice is that turn's final message.
 * - (no reply) a turn ending on no_reply_needed with nothing after is
 *   silent; one that began after it is not.
 * - (worked) a turn that called a tool has worked for every frame after it
 *   (limit-moves.ts `takeCredentialTurn` does not run it again); one that died
 *   there with no result, then a next turn whose first frame is Claude
 *   Code's credential refusal: that turn has not worked, so it runs again.
 *
 *   bun scripts/probe-kit/run.ts limit-notice-final-message
 */

import { NO_REPLY_TOOL } from "../../../packages/core/src/no-reply";
import type { NeutralAssistantBlock } from "../../../packages/core/src/session-messages";
import { turnState } from "../../../packages/hub/src/turn-state";
import type { Kit, Spec } from "../spec";

/** Claude Code's text in its `rate_limit` assistant frame. */
const NOTICE = "You've hit your limit · resets 3pm (UTC)";
/** What the next turn says. */
const DONE = "PROBE-LIMIT-DONE: the importer runs";

const text = (words: string): NeutralAssistantBlock[] => [
  { type: "text", text: words },
];
const call = (name: string): NeutralAssistantBlock[] => [
  { type: "tool_use", id: crypto.randomUUID(), name, input: {} },
];

/**
 * A normal turn that answers with no tool call (a call would clear what came
 * before it anyway): its answer, then its result.
 */
const normalTurn = (
  speech: ReturnType<typeof turnState>,
  id: string,
  began = true
) => {
  if (began) {
    speech.began(id);
  }
  speech.frame(id, text(DONE));
  return speech.ended(id);
};

const run = (kit: Kit): Promise<void> => {
  const speech = turnState();

  const answered = crypto.randomUUID();
  speech.began(answered);
  speech.frame(answered, text(NOTICE));
  speech.over(answered);
  const afterAnswered = normalTurn(speech, answered);
  kit.check(
    "(answered) a refused turn the at-limit controller answers leaves the next turn's final message its own",
    afterAnswered.text === DONE,
    JSON.stringify(afterAnswered)
  );

  const gone = crypto.randomUUID();
  speech.began(gone);
  speech.frame(gone, text(NOTICE));
  const afterGone = normalTurn(speech, gone);
  const unstarted = crypto.randomUUID();
  speech.began(unstarted);
  speech.frame(unstarted, text(NOTICE));
  const withoutStart = normalTurn(speech, unstarted, false);
  kit.check(
    "(no result) a refused turn whose result never came leaves the next turn's final message its own; the turn's start is what clears it",
    afterGone.text === DONE && withoutStart.text?.startsWith(NOTICE) === true,
    JSON.stringify({ afterGone, withoutStart })
  );

  const own = crypto.randomUUID();
  speech.began(own);
  speech.frame(own, text(NOTICE));
  const ownWords = speech.ended(own);
  kit.check(
    "(its own) a refused turn nobody answers ends on its own notice",
    ownWords.text === NOTICE && !ownWords.onNoReply,
    JSON.stringify(ownWords)
  );

  const quiet = crypto.randomUUID();
  speech.began(quiet);
  speech.frame(quiet, text("Nothing for the person."));
  speech.frame(quiet, call(`mcp__cawco__${NO_REPLY_TOOL}`));
  const quietWords = speech.ended(quiet);
  speech.began(quiet);
  speech.frame(quiet, call(NO_REPLY_TOOL));
  speech.began(quiet);
  speech.frame(quiet, text(DONE));
  const nextWords = speech.ended(quiet);
  kit.check(
    "(no reply) a turn ending on no_reply_needed is silent; a turn begun after one cut there is not",
    quietWords.text === undefined &&
      quietWords.onNoReply &&
      nextWords.text === DONE &&
      !nextWords.onNoReply,
    JSON.stringify({ quietWords, nextWords })
  );

  const died = crypto.randomUUID();
  speech.began(died);
  speech.frame(died, call("Bash"));
  speech.frame(died, text("Running the build."));
  const workedMidTurn = speech.worked(died);
  // Its process dies here: no result. The next turn's first frame is the
  // refusal, opened as a turn before it is read.
  speech.began(died);
  speech.frame(died, text("Invalid API key · Please run /login"));
  const workedAfterDeath = speech.worked(died);
  kit.check(
    "(worked) a turn that called a tool stays worked to its end; after it died with no result, the next turn's credential refusal finds no work and runs again",
    workedMidTurn && !workedAfterDeath,
    JSON.stringify({ workedMidTurn, workedAfterDeath })
  );
  return Promise.resolve();
};

const spec: Spec = {
  group: "The hub and machines",
  name: "limit-notice-final-message",
  run,
};

export default spec;
