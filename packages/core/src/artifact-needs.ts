/**
 * Artifacts waiting on the person, as Needs you lists them (Projects spec
 * §5.2: "every card of kind `you`, every session that is asking, and every
 * artifact waiting on the person"). The hub derives each from the artifact's
 * doc (its `state`, `pins`, `meta.changes`) and the person's own marks there
 * (`seenAt`, the panel's look), never from a stored flag
 * (hub artifacts/needs.ts), and serves the lane with every other item:
 * `GET /api/artifact-needs`, the `artifact.needs` frame, and `/api/pending`.
 *
 * One item per artifact with an open question (hub artifacts/questions.ts):
 * a page to pick on or a canvas to judge, its ask line set, its session not
 * ended, or an open pin whose agent's reply asks the person something (core
 * comments.ts `pinAsks`), its reasons strongest first: not opened, questions
 * not answered, pins asking. A question is answered by a pick, a note, a set
 * value, or a pin on it the agent replied to and resolved, Send or no Send:
 * what is written and not sent asks nothing more of the person. A reply that
 * asks nothing stays on the page. A page or preview with no ask and no pin
 * asking is never one. A revision with nothing asked, a resolved pin's
 * closing answer and a session that ended with its ask unanswered are
 * notices, never needs: a notice never outranks an ask.
 */
import type { HarnessKind } from "./harness/kinds";
import type { ArtifactKind } from "./index";
import { unhandled } from "./unhandled";
import { accountsWords } from "./words/accounts";
import { artifactWords } from "./words/artifacts";

/** Why an artifact waits on the person, one reason each. */
export type ArtifactReason =
  /** A canvas or page to judge, shown and never opened. */
  | { kind: "unopened" }
  /** A decision page's questions: `answered` of `asked` (those withdrawn are not asked). */
  | { answered: number; asked: number; kind: "answers" }
  /**
   * Open pins whose agent's reply asks the person something, not yet
   * replied to or resolved (core comments.ts `pinAsks`); `pin` the first by
   * number. It stands an artifact's row by itself.
   */
  | { count: number; kind: "answer"; pin: number };

/** The reasons' order, strongest first: what the row line leads with. */
export const ARTIFACT_REASONS = [
  "unopened",
  "answers",
  "answer",
] as const satisfies readonly ArtifactReason["kind"][];

/** Where the panel opens an artifact: its first pending stop. */
export type ArtifactStop = { card: string } | { pin: number } | { top: true };

/**
 * Where a press opens an artifact (a chip's place, an address's `?stop=`):
 * a pending stop, or a spot an update changed (its anchor).
 */
export type ArtifactPlace = ArtifactStop | { change: string };

/** One artifact waiting on the person: a Needs-you item. */
export interface ArtifactNeed {
  artifactId: string;
  artifactKind: ArtifactKind;
  /** What the person does there, in their words: the row's title, the push's body. */
  ask: string;
  /** Opens its session with the artifact in its panel at {@link stop}. */
  href: string;
  /** The session whose panel holds it. */
  instanceId: string;
  kind: "artifact";
  /** `[title](cawco:artifact/<id>)`: how a line of words names it. */
  link: string;
  machineId: string;
  /**
   * The notice id its Not now acknowledges (hub notices.ts): the item leaves
   * the lane until it is raised again, a revision or a new answer.
   */
  notNow: string;
  /**
   * A decision page (one that asks choices): it carries its own Send at its
   * foot, so its row stands none (the owner's pick, "Only the page's own
   * Send").
   */
  ownSend: boolean;
  /**
   * Put away with Not now at this raise or a later one: out of Needs you
   * (its count, its rows, the push, the phone's list), still waiting in
   * Files with its dot. Carried so every screen hears it move.
   */
  parked: boolean;
  /** Its reasons, strongest first; never empty. */
  pending: ArtifactReason[];
  /** The project it was made in; null outside one. */
  project: string | null;
  /** When it became pending, ms epoch on the hub's clock: its publish, or the agent's newest reply that asks. */
  raisedAt: number;
  stop: ArtifactStop;
  /** What it is named by to the person (its agent's title): a row's name, a push's title. */
  title: string;
  /** What Send sends now; 0 when nothing is written and unsent. */
  unsent: number;
}

/** What one notice of an artifact says, with the notice id its ✕ acknowledges. */
export type ArtifactNeedNoticePart =
  /** A revision with nothing asked: what it changed that the person hasn't looked at. */
  | { count: number; id: string; kind: "changed" }
  /** Resolved pins whose closing answer the person hasn't read; `pin` the first. */
  | { count: number; id: string; kind: "closed"; pin: number }
  /** Its session ended with the ask unanswered: what was never done. */
  | {
      harness: HarnessKind | null;
      id: string;
      kind: "ended";
      reason: ArtifactReason;
    };

/** One artifact's notice in Caw's panel: one row per artifact. */
export interface ArtifactNeedNotice {
  artifactId: string;
  artifactKind: ArtifactKind;
  /** When the newest part happened, ms epoch on the hub's clock. */
  at: number;
  /** Opens it, as a need's does; null when no session holds it. */
  href: string | null;
  instanceId: string | null;
  machineId: string | null;
  parts: ArtifactNeedNoticePart[];
  project: string | null;
  stop: ArtifactStop;
  /** What it is named by to the person (its agent's title). */
  title: string;
}

/** The items Needs you lists: those not put away with Not now. */
export const unparked = (needs: readonly ArtifactNeed[]): ArtifactNeed[] =>
  needs.filter((need) => !need.parked);

/** Hub-originated: every artifact need and notice, whole, on each change. */
export interface ArtifactNeedsFrame {
  instanceId?: undefined;
  kind: "artifact.needs";
  needs: ArtifactNeed[];
  notices: ArtifactNeedNotice[];
}

/** `GET /api/artifact-needs`: the lane's artifacts as they stand. */
export interface ArtifactNeedsRead {
  needs: ArtifactNeed[];
  notices: ArtifactNeedNotice[];
}

/** An artifact's pending state as its own list reads it (Files, the panel's menu). */
export interface ArtifactPending {
  pending: ArtifactReason[];
  raisedAt: number;
}

/** The notice id a Not now on artifact `id` raised at `raisedAt` acknowledges. */
export const notNowId = (id: string, raisedAt: number): string =>
  `artifact-not-now:${id}:${raisedAt}`;

/**
 * The address that opens artifact `id` in its panel at `stop`, in `view`:
 * the session that holds it.
 */
export const artifactStopHref = (
  view: string,
  id: string,
  stop: ArtifactPlace
): string => {
  const base = `/session/${encodeURIComponent(view)}?artifact=${encodeURIComponent(id)}`;
  if ("pin" in stop) {
    return `${base}&stop=pin:${stop.pin}`;
  }
  if ("card" in stop) {
    return `${base}&stop=card:${encodeURIComponent(stop.card)}`;
  }
  if ("change" in stop) {
    return `${base}&stop=change:${encodeURIComponent(stop.change)}`;
  }
  return base;
};

/** A project's setup page's name: its decision page `decisions/setup/` (hub setup.ts `isSetupPage`). */
export const SETUP_PAGE = "setup";

/** Project `projectId`'s setup page in its Decisions tab, at `card` when one is named (`#<card>`). */
export const setupPageAt = (projectId: string, card: string | null): string =>
  `/project/${encodeURIComponent(projectId)}?view=decisions&page=${SETUP_PAGE}${card ? `#${encodeURIComponent(card)}` : ""}`;

/**
 * Where a project's setup page lands, by every route that shows it (Caw's
 * `artifact_create` and `artifact_show`, the person's show: a chip, a card
 * chip, Files, a link; Needs you): its Decisions tab at the page, at
 * `card` when one is named; while the project is not set up and no card is
 * named, its board, which draws the draft. A card stands only on the page,
 * so a card named lands there whether it is set up or not (the dashboard's
 * half: setup-progress.ts `setupLandsOnBoard`). It never opens in a panel.
 */
export const setupLanding = (
  projectId: string,
  setUp: boolean,
  card: string | null
): string =>
  setUp || card
    ? setupPageAt(projectId, card)
    : `/project/${encodeURIComponent(projectId)}`;

/**
 * The address a Needs-you row's or notice's name links to, from its `href`:
 * a session's, without the artifact it opens (the press opens that
 * itself); a setup page's landing (core {@link setupLanding}) whole.
 */
export const needLinkOf = (href: string): string =>
  href.startsWith("/session/") ? (href.split("?")[0] ?? href) : href;

/** A `stop` query value read back; the top when it names none. */
export const artifactStopOf = (value: string | null): ArtifactPlace => {
  if (value?.startsWith("pin:")) {
    const pin = Number(value.slice(4));
    if (Number.isInteger(pin) && pin > 0) {
      return { pin };
    }
  }
  if (value?.startsWith("card:") && value.length > 5) {
    return { card: value.slice(5) };
  }
  if (value?.startsWith("change:") && value.length > 7) {
    return { change: value.slice(7) };
  }
  return { top: true };
};

/** One reason in the row's words; `alone`, the only one, an answer says on which pin. */
export const reasonWords = (reason: ArtifactReason, alone = false): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.notOpened;
    case "answers":
      return artifactWords.answered(reason.answered, reason.asked);
    case "answer":
      return alone && reason.count === 1
        ? artifactWords.newAnswerOn(reason.pin)
        : artifactWords.newAnswers(reason.count);
    default:
      unhandled("reason", reason);
  }
};

/** The row's line: every reason, strongest first ("3 of 9 answered · 1 new answer"). */
export const reasonLine = (pending: readonly ArtifactReason[]): string =>
  pending
    .map((reason) => reasonWords(reason, pending.length === 1))
    .join(" · ");

/** The strongest reason as a Files card's meta line says it ("3 of 9"). */
export const reasonShort = (reason: ArtifactReason): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.notOpenedShort;
    case "answers":
      return artifactWords.answeredShort(reason.answered, reason.asked);
    case "answer":
      return reasonWords(reason);
    default:
      unhandled("reason", reason);
  }
};

/** What was never done, as an ended session's notice says it. */
const neverDone = (reason: ArtifactReason, title: string): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.neverOpened(title);
    case "answers":
      return artifactWords.neverAnswered(reason.asked - reason.answered, title);
    case "answer":
      return artifactWords.neverRead(reason.count, title);
    default:
      unhandled("reason", reason);
  }
};

/** One part of a notice in words: its row's line. */
export const noticePartWords = (
  part: ArtifactNeedNoticePart,
  title: string
): string => {
  switch (part.kind) {
    case "changed":
      return artifactWords.changedSince(title, part.count);
    case "closed":
      return artifactWords.closedAnswers(title, part.count, part.pin);
    case "ended":
      return artifactWords.ended(
        part.harness
          ? accountsWords.harnesses[part.harness]
          : artifactWords.itsSession,
        neverDone(part.reason, title)
      );
    default:
      unhandled("notice", part);
  }
};
