/**
 * Artifacts waiting on the person, as Needs you lists them (Projects spec
 * §5.2: "every card of kind `you`, every session that is asking, and every
 * artifact waiting on the person"). The hub derives each from the artifact's
 * doc (its `state`, `pins`, `meta.changes`) and the person's own marks there
 * (`seenAt`, the panel's look), never from a stored flag
 * (hub artifacts/needs.ts), and serves the lane with every other item:
 * `GET /api/artifact-needs`, the `artifact.needs` frame, and `/api/pending`.
 *
 * One item per artifact, its reasons strongest first: not opened, picks not
 * made, marks written and not sent, an agent's answer on an open pin the
 * person hasn't looked at. A revision with nothing asked, a resolved pin's
 * closing answer and a session that ended with its ask unanswered are
 * notices, never needs: a notice never outranks an ask.
 */
import type { HarnessKind } from "./harness";
import type { ArtifactKind } from "./index";
import { accountsWords } from "./words/accounts";
import { artifactWords } from "./words/artifacts";

/** Why an artifact waits on the person, one reason each. */
export type ArtifactReason =
  /** Shown, and never opened: a page to pick on or a canvas to judge. */
  | { kind: "unopened" }
  /** A decision page's picks: `made` of `asked`. */
  | { asked: number; kind: "picks"; made: number }
  /** Picks, notes, pins and ink written and not sent (the panel's Send count). */
  | { count: number; kind: "unsent" }
  /** Open pins with an agent's answer newer than the person's look; `pin` the first by number. */
  | { count: number; kind: "answer"; pin: number };

/** The reasons' order, strongest first: what the row line leads with. */
export const ARTIFACT_REASONS = [
  "unopened",
  "picks",
  "unsent",
  "answer",
] as const satisfies readonly ArtifactReason["kind"][];

/** Where the panel opens an artifact: its first pending stop. */
export type ArtifactStop = { card: string } | { pin: number } | { top: true };

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
  /** `[name](cawco:artifact/<id>)`: how a line of words names it. */
  link: string;
  machineId: string;
  name: string;
  /**
   * The notice id its Not now acknowledges (hub notices.ts): the item leaves
   * the lane until it is raised again, a revision or a new answer.
   */
  notNow: string;
  /** Its reasons, strongest first; never empty. */
  pending: ArtifactReason[];
  /** The project it was made in; null outside one. */
  project: string | null;
  /** When it became pending, ms epoch on the hub's clock: its publish, or the agent's newest answer. */
  raisedAt: number;
  stop: ArtifactStop;
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
  name: string;
  parts: ArtifactNeedNoticePart[];
  project: string | null;
  stop: ArtifactStop;
}

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
 * the session that holds it, or for one a project's Caw made, the thread
 * his turn answered (`thread:<id>`), which shows his panel.
 */
export const artifactStopHref = (
  view: string,
  id: string,
  stop: ArtifactStop
): string => {
  const base = `/session/${encodeURIComponent(view)}?artifact=${encodeURIComponent(id)}`;
  if ("pin" in stop) {
    return `${base}&stop=pin:${stop.pin}`;
  }
  if ("card" in stop) {
    return `${base}&stop=card:${encodeURIComponent(stop.card)}`;
  }
  return base;
};

/** A `stop` query value read back; the top when it names none. */
export const artifactStopOf = (value: string | null): ArtifactStop => {
  if (value?.startsWith("pin:")) {
    const pin = Number(value.slice(4));
    if (Number.isInteger(pin) && pin > 0) {
      return { pin };
    }
  }
  if (value?.startsWith("card:") && value.length > 5) {
    return { card: value.slice(5) };
  }
  return { top: true };
};

/** One reason in the row's words; `alone`, the only one, an answer says on which pin. */
export const reasonWords = (reason: ArtifactReason, alone = false): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.notOpened;
    case "picks":
      return artifactWords.picked(reason.made, reason.asked);
    case "unsent":
      return artifactWords.unsent(reason.count);
    case "answer":
      return alone && reason.count === 1
        ? artifactWords.newAnswerOn(reason.pin)
        : artifactWords.newAnswers(reason.count);
    default: {
      const unhandled: never = reason;
      throw new Error(`unhandled reason: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** The row's line: every reason, strongest first ("3 of 9 picked · 2 unsent · 1 new answer"). */
export const reasonLine = (pending: readonly ArtifactReason[]): string =>
  pending
    .map((reason) => reasonWords(reason, pending.length === 1))
    .join(" · ");

/** The strongest reason as a Files card's meta line says it ("3 of 9"). */
export const reasonShort = (reason: ArtifactReason): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.notOpenedShort;
    case "picks":
      return artifactWords.pickedShort(reason.made, reason.asked);
    case "unsent":
    case "answer":
      return reasonWords(reason);
    default: {
      const unhandled: never = reason;
      throw new Error(`unhandled reason: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** What was never done, as an ended session's notice says it. */
const neverDone = (reason: ArtifactReason, name: string): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.neverOpened(name);
    case "picks":
      return artifactWords.neverPicked(reason.asked - reason.made, name);
    case "unsent":
      return artifactWords.neverSent(reason.count, name);
    case "answer":
      return artifactWords.neverRead(reason.count, name);
    default: {
      const unhandled: never = reason;
      throw new Error(`unhandled reason: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** One part of a notice in words: its row's line. */
export const noticePartWords = (
  part: ArtifactNeedNoticePart,
  name: string
): string => {
  switch (part.kind) {
    case "changed":
      return artifactWords.changedSince(name, part.count);
    case "closed":
      return artifactWords.closedAnswers(name, part.count, part.pin);
    case "ended":
      return artifactWords.ended(
        part.harness
          ? accountsWords.harnesses[part.harness]
          : artifactWords.itsSession,
        neverDone(part.reason, name)
      );
    default: {
      const unhandled: never = part;
      throw new Error(`unhandled notice: ${JSON.stringify(unhandled)}`);
    }
  }
};
