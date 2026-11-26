/**
 * The questions an artifact puts to the person, one list both sides read:
 * Needs you counts the open ones (needs.ts), and the session that asked
 * reads every one, open or answered, in `open_items` (open-items.ts), and
 * takes or withdraws it with `question_close`. Derived from the artifact's
 * doc on every read, never stored, but for the agent's own marks
 * (`meta.questionsClosed`).
 *
 * An artifact asks only while it puts a pick to the person (`asked`: a page
 * to pick on or a design graph to judge, its ask line set, not a draft, not
 * handed up or held, not an option's media on a page, its folder not gone):
 *
 * - **card**: each card of a decision page (each `data-cawco-choice` of an
 *   HTML page). Answered by a pick (core `pickMade`), his own words in place
 *   of one (core choices.ts `ownWordsEntry`), a note on it, or a pin
 *   standing on it ({@link pinCard}) that the agent replied to and resolved;
 *   dismissed by his Dismiss on it (`dismissedEntry`).
 * - **judge**: a design graph's pick between its two or more directions,
 *   the artifact itself. Answered by any value, pick or note the person set
 *   on it (a direction picked, his own words in place of a pick,
 *   `cawco.set`), never by one he is only trying out (core `answersIn`: a
 *   dial, a tuned move); dismissed by his Dismiss on its pick (`picked`).
 *
 * A page or canvas that puts no pick to him asks nothing, opened or not. An
 * agent's reply on a pin that needs his choice is its session's question
 * (core asks.ts, `comment_reply`'s `question`), never the artifact's.
 *
 * Send counts for nothing here: what is written is an answer whether or not
 * it went. A question he dismissed is `dismissed` until he answers it after
 * all (a pick replaces the dismissal); it asks him no more and waits on the
 * agent as an answer does. A question the agent closed is `taken` (it acted
 * on his answer, or on his words elsewhere) until a newer answer of his, or
 * `withdrawn` (superseded) for good; neither counts as asking him, and
 * nothing is deleted.
 */
import type { ArtifactStop } from "@cawco/core/artifact-needs";
import type { AskState } from "@cawco/core/asks";
import type { ChoiceEntry } from "@cawco/core/choices";
import { noteText } from "@cawco/core/choices";
import type { Anchor } from "@cawco/core/comments/anchor";
import type { Pin } from "@cawco/core/comments/model";
import { type DecisionCard, pickMade } from "@cawco/core/decisions";
import type { QuestionClose } from "@cawco/core/doc-meta";
import { artifactLink, decisionLink } from "@cawco/core/references";
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
  /** His words: the note, his own words in place of a pick, the set keys, the pin's text, what a dismissal recorded before answers in his own words existed holds; empty for a dismissal without words. */
  said: string;
}

/** A question's state: an ask's (core asks.ts), `dismissed` once he put it down without a pick, and `taken` once the agent acted on his answer. */
export type QuestionState = AskState | "dismissed" | "taken";

export interface Question {
  answer: QuestionAnswer | null;
  close: QuestionClose | null;
  /** Its key in `meta.questionsClosed`: `card:<id>`, `judge`. */
  key: string;
  kind: SessionQuestionKind;
  /** What names it to the person and to `question_close`: a card's or the artifact's link. */
  link: string;
  state: QuestionState;
  /** Where the artifact's panel opens to answer it: the card, or its top. */
  stop: ArtifactStop;
  /** A card's why; empty for any other. */
  why: string;
  /** The question as asked: a card's, or the artifact's ask. */
  words: string;
}

/** What the questions of one artifact are read from. */
export interface QuestionsInput {
  artifact: { ask: string; id: string; name: string; title: string };
  /** It is put to the person: a page to pick on or a design graph to judge, its ask line set (needs.ts `asks`). */
  asked: boolean;
  /** Its choices: a program's cards, or an HTML page's choice ids. */
  cards: readonly { card?: DecisionCard; id: string }[];
  closes: Readonly<Record<string, QuestionClose>>;
  /** It is a design graph to judge whose two or more directions put a pick to the person, not a page of cards. */
  judged: boolean;
  /** Each Canvas or Preview piece's card, by the artifact it shows. */
  media: ReadonlyMap<string, string>;
  pins: readonly Pin[];
  /** His answers in its `state` (core `answersIn`): what he is only trying out, like a dial, left out. */
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
const pinCard = (
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
const answeredPin = (pin: Pin): pin is Pin & { resolvedAt: string } =>
  !!pin.resolvedAt && pin.thread.some((entry) => entry.by === "agent");

/** His first words on pin `pin`, the thread's opening entry. */
const opening = (pin: Pin): string =>
  pin.thread.find((entry) => entry.by === "person")?.text ?? "";

/** His answer without a pick, when `entry` is one: his own words in place of a pick, or his dismissal, when, and what he said. */
const pickless = (entry: ChoiceEntry | undefined): QuestionAnswer | null => {
  if (entry?.ownWords) {
    return { by: "words", at: entry.at, said: noteText(entry.note) ?? "" };
  }
  return entry?.dismissed
    ? { by: "dismiss", at: entry.at, said: noteText(entry.note) ?? "" }
    : null;
};

/** A card's answer: his own words or his dismissal, else his pick, else his note, else a pin on it answered and resolved. */
const cardAnswer = (
  asked: { card?: DecisionCard; id: string },
  entry: ChoiceEntry | undefined,
  pins: readonly Pin[]
): QuestionAnswer | null => {
  const unpicked = pickless(entry);
  if (unpicked) {
    return unpicked;
  }
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
  return pin ? { by: "pin", at: pin.resolvedAt, said: opening(pin) } : null;
};

/** A judgement's answer: his own words or his dismissal on its pick, else every value, pick or note he set on it, at the newest. */
const judgeAnswer = (
  state: Readonly<Record<string, ChoiceEntry>>
): QuestionAnswer | null => {
  const unpicked = pickless(state.picked);
  if (unpicked) {
    return unpicked;
  }
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

/** Its state: withdrawn for good; taken until a newer answer; dismissed; answered; open. */
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
  if (answer?.by === "dismiss") {
    return "dismissed";
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

/** Every question `input`'s artifact puts to the person, in page order: its cards or its judgement, each with the agent's close. */
export const questionsOf = (input: QuestionsInput): Question[] =>
  (input.asked ? askedOn(input) : []).map((one) => {
    const close = input.closes[one.key] ?? null;
    return { ...one, close, state: questionState(one.answer, close) };
  });

/** What an artifact's questions count for Needs you: those still asked (not withdrawn), those answered or taken, and the first open card. */
export const answersOf = (
  questions: readonly Question[]
): { answered: number; asked: number; firstOpen: string | null } => {
  const asked = questions.filter((one) => one.state !== "withdrawn");
  const open = asked.filter((one) => one.state === "open");
  const card = open.find((one) => one.kind === "card");
  return {
    asked: asked.length,
    answered: asked.length - open.length,
    firstOpen: card?.key.slice("card:".length) ?? null,
  };
};

/** Whether every question `questions` holds of `kind` is answered, taken or withdrawn: none open. */
export const noneOpen = (
  questions: readonly Question[],
  kind: Question["kind"]
): boolean =>
  questions.every((one) => one.kind !== kind || one.state !== "open");

/** What the asking session still holds of `questions`: the open ones and those answered or dismissed and not taken; one taken or withdrawn is done with. */
export const stillAsked = (questions: readonly Question[]): Question[] =>
  questions.filter(
    (one) =>
      one.state === "open" ||
      one.state === "answered" ||
      one.state === "dismissed"
  );
