/**
 * The questions an artifact puts to the person, one list both sides read:
 * Needs you counts the open ones (needs.ts), and the session that asked
 * reads every one, open or answered, in `open_items` (open-items.ts), and
 * takes or withdraws it with `question_close`. Derived from the artifact's
 * doc on every read, never stored, but for the agent's own marks
 * ({@link QUESTIONS_CLOSED}).
 *
 * An artifact asks while it is put to the person (`asked`: a page to pick
 * on or a canvas to judge, its ask line set, not a draft, not handed up or
 * held, not an option's media on a page, its folder not gone):
 *
 * - **card**: each card of a decision page (each `data-cawco-choice` of an
 *   HTML page). Answered by a pick (core `pickMade`), a note on it, or a pin
 *   standing on it ({@link pinCard}) that the agent replied to and resolved.
 * - **judge**: a canvas or preview to judge, the artifact itself. Answered
 *   by any value, pick or note the person set on it (a tune, `cawco.set`).
 *
 * Any artifact of the person's (not a draft, not handed up or held, not an
 * option's media, not a working canvas: `draw`) also asks on each pin the agent's reply asked on
 * (`comment_reply`'s `asks`): **pin**, open while it asks (core `pinAsks`),
 * answered by the person's reply after it or his resolve. The agent's own
 * resolve closes it.
 *
 * Send counts for nothing here: what is written is an answer whether or not
 * it went. A question the agent closed is `taken` (it acted on his answer,
 * or on his words elsewhere) until a newer answer of his, or `withdrawn`
 * (superseded) for good; neither counts as asking him, and nothing is
 * deleted.
 */
import type { ArtifactStop } from "@cawco/core/artifact-needs";
import type { AskState } from "@cawco/core/asks";
import type { ChoiceEntry } from "@cawco/core/choices";
import { noteText } from "@cawco/core/choices";
import type { Anchor } from "@cawco/core/comments/anchor";
import { type Pin, pinAsks } from "@cawco/core/comments/model";
import { type DecisionCard, pickMade } from "@cawco/core/decisions";
import type { QuestionClose } from "@cawco/core/doc-meta";
import { pinName } from "@cawco/core/pin-name";
import { artifactLink, decisionLink, pinLink } from "@cawco/core/references";
import type {
  SessionAnswerHow,
  SessionQuestionKind,
} from "@cawco/core/session-questions";
import { cssEscape } from "./page-changes";

/** What he answered with, in his words. */
export interface QuestionAnswer {
  at: string;
  by: SessionAnswerHow;
  /** The options he picked, by label; a pick only. */
  options?: string[];
  /** His words: the note, the set keys, the pin's or reply's text; empty for a resolve. */
  said: string;
}

/** A question's state: an ask's (core asks.ts), and `taken` once the agent acted on his answer. */
export type QuestionState = AskState | "taken";

export interface Question {
  answer: QuestionAnswer | null;
  close: QuestionClose | null;
  /** Its key in {@link QUESTIONS_CLOSED}: `card:<id>`, `judge`, `pin:<id>`. */
  key: string;
  kind: SessionQuestionKind;
  /** What names it to the person and to `question_close`: a card's, the artifact's or a pin's link. */
  link: string;
  state: QuestionState;
  /** Where the artifact's panel opens to answer it: the card, the pin, or its top. */
  stop: ArtifactStop;
  /** A card's why; empty for any other. */
  why: string;
  /** The question as asked: a card's, the artifact's ask, the agent's asking reply. */
  words: string;
}

/** What the questions of one artifact are read from. */
export interface QuestionsInput {
  artifact: { ask: string; id: string; name: string; title: string };
  /** It is put to the person: a page to pick on or a canvas to judge (needs.ts `asks`). */
  asked: boolean;
  /** Its choices: a program's cards, or an HTML page's choice ids. */
  cards: readonly { card?: DecisionCard; id: string }[];
  closes: Readonly<Record<string, QuestionClose>>;
  /** It is a canvas or preview to judge, not a page of cards. */
  judged: boolean;
  /** Each Canvas or Preview piece's card, by the artifact it shows. */
  media: ReadonlyMap<string, string>;
  pins: readonly Pin[];
  /** Its pins may ask the person: not a draft, not handed up or held, not an option's media. */
  pinsMayAsk: boolean;
  state: Readonly<Record<string, ChoiceEntry>>;
}

/** A selector's next character after an id that ends there: anything but more of a name. */
const ID_ENDS = /^(?:$|[\s>:.[+~#])/u;

/**
 * The card pin `pin` stands on, of `cards`: the piece it is in (its
 * Canvas's or Preview's card, {@link QuestionsInput.media}), else the card
 * its outermost selector starts at (`#decision-<id>`, or an HTML page's
 * `[data-cawco-choice="<id>"]`); null on none.
 */
export const pinCard = (
  anchor: Anchor,
  cards: readonly string[],
  media: ReadonlyMap<string, string>
): string | null => {
  if (!("selector" in anchor)) {
    return null;
  }
  const embedded = anchor.embed ? media.get(anchor.embed.artifact) : undefined;
  if (embedded && cards.includes(embedded)) {
    return embedded;
  }
  const top = anchor.frames?.[0] ?? anchor.selector;
  return (
    cards.find((id) => {
      const card = `#decision-${cssEscape(id)}`;
      return (
        top === `[data-cawco-choice="${cssEscape(id)}"]` ||
        top.startsWith(`[data-cawco-choice="${cssEscape(id)}"] `) ||
        (top.startsWith(card) && ID_ENDS.test(top.slice(card.length)))
      );
    }) ?? null
  );
};

/** A pin the agent replied to and then resolved: its answer, given on the thing it stands on. */
const answeredPin = (pin: Pin): boolean =>
  !!pin.resolvedAt && pin.thread.some((entry) => entry.by === "agent");

/** His first words on pin `pin`, the thread's opening entry. */
const opening = (pin: Pin): string =>
  pin.thread.find((entry) => entry.by === "person")?.text ?? "";

/** A card's answer: his pick, else his note, else a pin on it answered and resolved. */
const cardAnswer = (
  asked: { card?: DecisionCard; id: string },
  entry: ChoiceEntry | undefined,
  pins: readonly Pin[]
): QuestionAnswer | null => {
  const note = noteText(entry?.note);
  if (entry && pickMade(asked.card, entry)) {
    return {
      by: "pick",
      at: entry.at,
      options: entry.options.map(
        (id) => asked.card?.options.find((one) => one.id === id)?.label ?? id
      ),
      said: note ?? "",
    };
  }
  if (entry && note) {
    return { by: "note", at: entry.at, said: note };
  }
  const pin = pins.find(answeredPin);
  return pin
    ? { by: "pin", at: pin.resolvedAt as string, said: opening(pin) }
    : null;
};

/** A judgement's answer: every value, pick or note he set on it, at the newest. */
const judgeAnswer = (
  state: Readonly<Record<string, ChoiceEntry>>
): QuestionAnswer | null => {
  const set = Object.entries(state).filter(
    ([, entry]) =>
      (entry.value !== null && entry.value !== undefined) ||
      entry.options.length > 0 ||
      noteText(entry.note) !== null
  );
  if (set.length === 0) {
    return null;
  }
  return {
    by: "value",
    at: set.map(([, entry]) => entry.at).reduce((a, b) => (a > b ? a : b)),
    said: set.map(([key]) => key).join(", "),
  };
};

/** An asking pin's answer: his reply after the agent's last asking reply, or his resolve. */
const pinAnswer = (pin: Pin, asking: number): QuestionAnswer | null => {
  if (pin.resolvedAt && pin.resolvedBy === "person") {
    return { by: "resolve", at: pin.resolvedAt, said: "" };
  }
  const reply = pin.thread
    .slice(asking + 1)
    .find((entry) => entry.by === "person");
  return reply ? { by: "reply", at: reply.at, said: reply.text } : null;
};

/** Its state: withdrawn for good; taken until a newer answer; answered; open. */
const questionState = (
  answer: QuestionAnswer | null,
  close: QuestionClose | null
): QuestionState => {
  if (close?.as === "withdrawn") {
    return "withdrawn";
  }
  if (close && (!answer || answer.at <= close.at)) {
    return "taken";
  }
  return answer ? "answered" : "open";
};

/** A question as read, before the agent's close is applied. */
type Asked = Omit<Question, "close" | "state">;

/** What `input`'s artifact asks as a page or a canvas to judge: each card, or its judgement. */
const askedOn = (input: QuestionsInput): Asked[] => {
  const { artifact } = input;
  const ids = input.cards.map((one) => one.id);
  const onCard = Map.groupBy(
    input.pins.flatMap((pin) => {
      const card = pinCard(pin.anchor, ids, input.media);
      return card ? [{ card, pin }] : [];
    }),
    (one) => one.card
  );
  const cards = input.cards.map((asked): Asked => {
    const words = asked.card?.question ?? asked.id;
    return {
      key: `card:${asked.id}`,
      kind: "card",
      link: decisionLink(artifact.id, asked.id, words),
      stop: { card: asked.id },
      words,
      why: asked.card?.why.trim() ?? "",
      answer: cardAnswer(
        asked,
        input.state[asked.id],
        (onCard.get(asked.id) ?? []).map((one) => one.pin)
      ),
    };
  });
  return input.judged && cards.length === 0
    ? [
        {
          key: "judge",
          kind: "judge",
          link: artifactLink(artifact.id, artifact.title),
          stop: { top: true },
          words: artifact.ask,
          why: "",
          answer: judgeAnswer(input.state),
        },
      ]
    : cards;
};

/** What `input`'s pins ask: each the agent's reply asked on, but one the agent resolved itself (its resolve closes what it asked). */
const askedOnPins = (input: QuestionsInput): Asked[] =>
  input.pins.flatMap((pin): Asked[] => {
    const asking = pin.thread.findLastIndex(
      (entry) => entry.by === "agent" && entry.asks === true
    );
    if (asking < 0 || (pin.resolvedAt && pin.resolvedBy !== "person")) {
      return [];
    }
    return [
      {
        key: `pin:${pin.id}`,
        kind: "pin",
        link: pinLink(input.artifact.id, pin.number, pinName(pin)),
        stop: { pin: pin.number },
        words: pin.thread[asking]?.text ?? "",
        why: "",
        answer: pinAsks(pin) ? null : pinAnswer(pin, asking),
      },
    ];
  });

/** Every question `input`'s artifact puts to the person, in page order: its cards or its judgement, then its asking pins, each with the agent's close. */
export const questionsOf = (input: QuestionsInput): Question[] =>
  [
    ...(input.asked ? askedOn(input) : []),
    ...(input.pinsMayAsk ? askedOnPins(input) : []),
  ].map((one) => {
    const close = input.closes[one.key] ?? null;
    return { ...one, close, state: questionState(one.answer, close) };
  });

/** What a page's questions count for Needs you: those still asked (not withdrawn), those answered or taken, and the first open one. */
export const answersOf = (
  questions: readonly Question[]
): { answered: number; asked: number; firstOpen: string | null } => {
  const cards = questions.filter(
    (one) => one.kind === "card" && one.state !== "withdrawn"
  );
  const open = cards.filter((one) => one.state === "open");
  return {
    asked: cards.length,
    answered: cards.length - open.length,
    firstOpen: open[0]?.key.slice("card:".length) ?? null,
  };
};

/** Whether every question `questions` holds of `kind` is answered, taken or withdrawn: none open. */
export const noneOpen = (
  questions: readonly Question[],
  kind: Question["kind"]
): boolean =>
  questions.every((one) => one.kind !== kind || one.state !== "open");

/** What the asking session still holds of `questions`: the open ones and those answered and not taken; one taken or withdrawn is done with. */
export const stillAsked = (questions: readonly Question[]): Question[] =>
  questions.filter((one) => one.state === "open" || one.state === "answered");
