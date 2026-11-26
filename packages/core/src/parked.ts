/**
 * What a session put to the person outside a tool call and waits on (hub
 * artifacts/service.ts `parkedOf`): each design graph it opened with
 * directions, and each card of its decision pages that Who decides gives the
 * person, of those its agent judged quick (core `ARTIFACT_PICKS`); an
 * enlarged pick is made in the panel alone. The dashboard parks each still open in the session's composer,
 * queued after the asks that hold its turn, oldest first, and answered there
 * as it is where it lives (`picked` on the graph, the card's pick and note on
 * its page), answered there in his own words (core choices.ts
 * `ownWordsEntry`, on the same key); once
 * answered or dismissed, the
 * transcript keeps it at the call that opened it. `GET /api/instances/:id/parked` answers it; the dashboard reads it again
 * on each `artifact.needs` frame, as it does the session's questions.
 */

import type { AskState } from "./asks";
import type { DecisionCard } from "./decisions";

/** The artifact an item stands on. */
export interface ParkedArtifact {
  id: string;
  /** The name its tools take. */
  name: string;
  title: string;
}

/** One direction of a design graph, as its graph's head lists it (core stage.ts `CanvasDirection`). */
export interface ParkedDirection {
  /** Its states file (or a design folder's page), as the canvas names it. */
  file: string;
  /** The agent's line on it: where in the product its value shows. */
  line: string;
  name: string;
  /** Its live story, the first the agent named of its file; null where it named none (the file's first). */
  story: string | null;
}

/**
 * How an item stands with the agent: `open` while it waits on the person;
 * `answered` once he did, by a pick or in his own words; `dismissed` once
 * he put it down without a pick or a word
 * (a pick of his after it answers it again); `taken` once the agent acted
 * on his answer or his words elsewhere; `withdrawn` when the agent took it
 * back unanswered.
 */
export type ParkedState = AskState | "dismissed" | "taken";

interface ParkedBase {
  artifact: ParkedArtifact;
  /** When it was put to the person, ISO: the queue's order. */
  askedAt: string;
  /** Put down without a pick (its Dismiss): when, and the words a dismissal recorded before answers in his own words existed holds, empty for none; null while it is not. */
  dismissed: { at: string; note: string } | null;
  /** Its key on its artifact, as `question_close` names it: `judge`, `card:<id>`. */
  key: string;
  state: ParkedState;
  /** Answered in his own words with no pick (its Other line): when, and those words; null while it is not. */
  words: { at: string; words: string } | null;
}

/** A pick between a design's directions, on its design graph. */
export interface ParkedPick extends ParkedBase {
  /** The graph's ask: what the agent wants decided. */
  ask: string;
  directions: ParkedDirection[];
  kind: "directions";
  /** Where its graph's stage page is served on the artifact's origin (core stage.ts `canvasPath`): each direction is drawn there, live. */
  path: string;
  /** The direction he picked, by its file; null while none is. */
  picked: string | null;
  /** When he picked it, ISO; null while none is. */
  pickedAt: string | null;
}

/** One card of a decision page, the person's by Who decides. */
export interface ParkedCard extends ParkedBase {
  /** His answer as the page keeps it: the options picked (by id, those the card still offers) and his note; null before either, once he dismissed it, and while he answered in his own words. */
  answer: { at: string; note: string; options: string[] } | null;
  card: DecisionCard;
  kind: "card";
}

export type ParkedItem = ParkedPick | ParkedCard;

/** `GET /api/instances/:id/parked`: the session's own items, oldest first. */
export interface ParkedRead {
  items: ParkedItem[];
}

/** An item's key across artifacts: what the composer and its minimize name it by. */
export const parkedId = (item: Pick<ParkedItem, "artifact" | "key">): string =>
  `parked:${item.artifact.id}/${item.key}`;

/** Whether `item` still waits on the person: what the composer parks. */
export const parkedOpen = (item: ParkedItem): boolean => item.state === "open";
