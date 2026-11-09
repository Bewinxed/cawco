import type { PageError, RenderReport, SectionRender } from "./stage";

/**
 * The artifact's latest ask, kept in its doc (`meta.asked`): the session
 * whose tool call made it (create, update, revise, show), when, the step
 * it was asked at while the session was at work on its plan (`step`: set,
 * the plan waits on it until it is answered or deleted, {@link planHolds}),
 * and when the writer's next turn ended with its plan not waiting on it and
 * no new show.
 */
export interface ArtifactAsked {
  at: string;
  by: string;
  movedAt?: string;
  step?: string;
}

/** One states file's last draw as a component canvas's doc keeps it (`meta.drawn`): the section, when and by whom, and the page's errors with it. */
export interface DrawnKept {
  at: string;
  by: RenderReport["by"];
  errors: PageError[];
  section: SectionRender;
}

/** The doc's `meta` key holding the agent's closes, by question key: the hub's alone to write. */
export const QUESTIONS_CLOSED = "questionsClosed";

/** The agent's close of a question: acted on his answer (`taken`), or superseded (`withdrawn`). */
export interface QuestionClose {
  as: "taken" | "withdrawn";
  at: string;
  /** The session that closed it. */
  by: string;
  /** Taken: his words it acted on, quoted; withdrawn: what superseded it. */
  why: string;
}

/**
 * Who sent a page: the person pressing Send, or the hub, once every
 * question had his answer (`sendAnswered`). A send from before the hub
 * kept it (2026-11-05) reads as his.
 */
export type SentBy = "person" | "hub";

/**
 * What an artifact's revisions changed that the person hasn't looked at, as
 * the hub reads them (the doc's `meta.changes`): a page's elements, a
 * decision page's cards, a canvas's elements. Each is a stop the panel
 * marks until the person has looked at it; one he hasn't is carried into
 * the next revision's set ({@link carryChanges}), so the set is "since you
 * looked", never only the latest revision's.
 */
export interface ArtifactChanges {
  /** When the latest revision was read. */
  at: string;
  items: ChangedItem[];
  /**
   * What the person's looks at them are kept by (the doc's `seen`): a page's
   * revision; a canvas's scene version (`meta.sceneVersion`), which each of
   * the agent's updates moves while the canvas stays the one live scene.
   */
  revision: number;
  /**
   * When the revision before it was made: an agent's reply in a pin's thread
   * after it is that revision's answer ({@link bindChanges}).
   */
  since?: string;
}

/**
 * One thing a revision changed: `element`, a page's element by its
 * selector, marked where it stands; `card`, a decision card, by its
 * selector (`#decision-<id>`); `canvas`, a canvas's element by its id;
 * `removed`, something gone, with no box to mark, stood in the tag by its
 * label alone. The anchor is what the person's look is kept by.
 */
export interface ChangedItem {
  /** Its words now, whole (up to {@link CHANGE_WORDS_MOST}); `label` when it has none past its label. */
  after?: string;
  anchor: string;
  /** Whether the agent answered its pin in the revision that changed it (a reply in its thread since the revision before). */
  answered?: boolean;
  /** Its words, whole (up to {@link CHANGE_WORDS_MOST}), when the person last looked; none when it was put in. */
  before?: string;
  /** What it is, by name ("Headline", "Button": core pin-name.ts `elementName`). */
  element?: string;
  kind: "element" | "card" | "canvas" | "removed";
  /** Its words now, or what it is: the "after". */
  label: string;
  /** It moved: the element it came after then, and the one it comes after now, by their words (empty: it came first). */
  moved?: { after: string; before: string };
  /** The comment it answers, or the one that stands on it, by pin id. */
  pin?: string;
  /** The revision (a canvas's scene version) that last changed it. */
  revision?: number;
  /** How many revisions changed it since the person looked. */
  times?: number;
}

/** The person's note with what they held, kept until the delivery that carries them (`meta.heldNote`). */
export interface HeldNote {
  at: string;
  text: string;
}
