/**
 * A session's final message for a turn holds only that turn's own words:
 * the "You've hit your limit" notice of a turn its account's limit refused
 * never starts the next turn's final message.
 *
 * Claude Code ends a refused turn with an assistant frame (`error:
 * "rate_limit"`) whose text is the notice, then the turn's `result`. The hub
 * (server.ts) keeps each turn's words in turn-speech.ts `turnSpeech`: every
 * top-level assistant frame goes to `frame`; a turn's start (server.ts
 * `turnUnderWay`, its first frame or its harness reading a send) to
 * `began`; a result the at-limit controller answers, a credential's turn
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
 *
 *   bun scripts/probe-kit/run.ts limit-notice-final-message
 */
import type { NeutralAssistantBlock } from "../../../packages/core/src/harness";
import { NO_REPLY_TOOL } from "../../../packages/core/src/no-reply";
import { turnSpeech } from "../../../packages/hub/src/turn-speech";
import type { Kit, Spec } from "../kit";

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
  speech: ReturnType<typeof turnSpeech>,
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
  const speech = turnSpeech();

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
  return Promise.resolve();
};

const spec: Spec = {
  group: "The hub and machines",
  name: "limit-notice-final-message",
  run,
};

export default spec;
