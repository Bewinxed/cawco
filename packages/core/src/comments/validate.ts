/** The hub's bounds on what a writer may leave in an artifact's doc. */

import type { MapDoc } from "../doc-maps";
import { readFileSpot } from "../file-spot";
import { commentsFull } from "../words/comment-lines";
import {
  attachmentsProblem,
  CHANGES_LIMIT,
  COMMENT_LIMITS,
  entriesOf,
  goneOf,
  headsOf,
  isObject,
  readPins,
  type ThreadEntry,
  threadBytes,
} from "./model";

/** A revision's key in the `seen` map: its number. */
const REVISION_KEY = /^\d{1,9}$/u;

/** Characters one anchor of a look holds. */
const SEEN_ANCHOR_MAX = 500;

/** Why a person's `seen` map may not be kept; null when it may. */
export function seenProblem(seen: Map<string, unknown>): string | null {
  if (seen.size > 2) {
    return "The page keeps the looks of its latest revision only.";
  }
  for (const [revision, anchors] of seen) {
    if (!(
      REVISION_KEY.test(revision) &&
      Array.isArray(anchors) &&
      anchors.every((anchor) => typeof anchor === "string")
    )) {
      return "A look is a revision's list of the anchors seen.";
    }
    if (anchors.length > CHANGES_LIMIT) {
      return `A look names at most ${CHANGES_LIMIT} anchors.`;
    }
    if (anchors.some((anchor) => anchor.length > SEEN_ANCHOR_MAX)) {
      return `An anchor holds at most ${SEEN_ANCHOR_MAX} characters.`;
    }
  }
  return null;
}

/** Why a thread entry may not be kept; null when it may. */
const entryProblem = (entry: unknown): string | null => {
  if (!(
    isObject(entry) &&
    typeof entry.id === "string" &&
    (entry.by === "person" || entry.by === "agent") &&
    typeof entry.text === "string" &&
    typeof entry.at === "string"
  )) {
    return "A thread entry is an object with its id, by, text and at.";
  }
  if (entry.text.length > COMMENT_LIMITS.text) {
    return `A thread entry holds at most ${COMMENT_LIMITS.text} characters.`;
  }
  const attached = attachmentsProblem(entry.attachments);
  if (attached) {
    return attached;
  }
  if (
    entry.by === "person" &&
    !entry.text.trim() &&
    !(Array.isArray(entry.attachments) && entry.attachments.length > 0)
  ) {
    return "A person's entry says something or carries an attachment.";
  }
  const { files } = entry;
  if (
    files !== undefined &&
    !(
      Array.isArray(files) &&
      files.every(
        (file) => typeof file === "string" && file.length <= COMMENT_LIMITS.file
      )
    )
  ) {
    return `A reply names files of at most ${COMMENT_LIMITS.file} characters.`;
  }
  return null;
};

/** Why a pin, read whole ({@link readPin}), may not be kept; null when it may. */
export function pinProblem(value: unknown): string | null {
  if (!(
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.number === "number" &&
    value.kind === "comment" &&
    isObject(value.anchor) &&
    Array.isArray(value.thread)
  )) {
    return "A pin is an object with its id, number, kind, anchor and thread.";
  }
  if (fileSpotProblem(value.anchor)) {
    return FILE_SPOT_PROBLEM;
  }
  for (const entry of value.thread) {
    const problem = entryProblem(entry);
    if (problem) {
      return problem;
    }
  }
  return null;
}

/** Why a mark's place in a file may not be kept: its anchor names a `file` that is no file spot (file-spot.ts). */
export const FILE_SPOT_PROBLEM =
  "A mark's place in a file is a point on its image or a PDF's page, a text's line or lines, or the file as a whole.";

/** Whether `anchor` names a `file` that is no file spot ({@link FILE_SPOT_PROBLEM}). */
export const fileSpotProblem = (anchor: Record<string, unknown>): boolean =>
  anchor.file !== undefined && readFileSpot(anchor.file) === null;

/** Why a pin's head is not one: its parts are its own keys, never inside it. */
const headProblem = (head: unknown): string | null =>
  isObject(head) &&
  typeof head.id === "string" &&
  typeof head.number === "number" &&
  !("thread" in head) &&
  !("anchor" in head)
    ? null
    : "A pin's head is its id, number, kind, when and by whom; its place, resolve and thread are their own keys.";

/** Why an `entries` key and its value don't belong together: the key names its pin and the entry's own id. */
const entryKeyProblem = (key: string, entry: unknown): string | null =>
  isObject(entry) &&
  typeof entry.id === "string" &&
  key.endsWith(`:${entry.id}`)
    ? null
    : "An entry is kept under its pin's id and its own.";

/**
 * Why a person's change of a doc's pins, `before` to `after`, may not be
 * kept; null when it may. Each part is its own key ({@link PIN_MAPS}): a
 * head holds no place or thread, and an entry stands under its pin's id and
 * its own. The agent's entries are the agent's (comment_reply), so a
 * person's change keeps every one of them as it was. A pin `gone` names is deleted,
 * whatever the change wrote of it: the doc lets it go ({@link honourDeletions}),
 * so it is not read.
 */
export function pinsProblem(before: MapDoc, after: MapDoc): string | null {
  const gone = goneOf(after);
  const standing = (id: string) => !gone.has(id);
  for (const head of headsOf(after).values()) {
    const problem = headProblem(head);
    if (problem) {
      return problem;
    }
  }
  for (const [key, entry] of entriesOf(after).entries()) {
    const problem = entryKeyProblem(key, entry);
    if (problem) {
      return problem;
    }
  }
  const pins = [...readPins(after).values()].filter((pin) => standing(pin.id));
  if (pins.length > COMMENT_LIMITS.pins) {
    return `An artifact keeps at most ${COMMENT_LIMITS.pins} pins.`;
  }
  const held = threadBytes(pins);
  if (held > COMMENT_LIMITS.bytes) {
    return commentsFull(held, COMMENT_LIMITS.bytes, "page");
  }
  const was = readPins(before);
  for (const pin of pins) {
    const problem = pinProblem(pin);
    if (problem) {
      return problem;
    }
    const agents = (thread: ThreadEntry[] | undefined) =>
      new Set(
        (thread ?? [])
          .filter((entry) => entry.by === "agent")
          .map((entry) => JSON.stringify(entry))
      );
    const now = agents(pin.thread);
    const then = agents(was.get(pin.id)?.thread);
    if ([...now].some((entry) => !then.has(entry))) {
      return "The agent's replies are written by comment_reply, not by the page.";
    }
    if ([...then].some((entry) => !now.has(entry))) {
      return "The agent's replies stay in their thread.";
    }
  }
  return null;
}

/** The longest pin id a tombstone names, and its time's length. Our call: a UUID and an ISO time fit well inside. */
const GONE_KEY_MAX = 100;
const GONE_AT_MAX = 40;

/**
 * Why a person's change from `before` to `after` (the doc's `gone`, by pin
 * id) may not be kept; null when it may. A tombstone is written once, by a
 * delete, and stays as it was: a deletion is never undone.
 */
export function goneProblem(
  before: Map<string, unknown>,
  after: Map<string, unknown>
): string | null {
  for (const [id, at] of before) {
    if (after.get(id) !== at) {
      return "A deleted comment stays deleted.";
    }
  }
  if (after.size > COMMENT_LIMITS.gone) {
    return `An artifact keeps at most ${COMMENT_LIMITS.gone} deleted comments.`;
  }
  for (const [id, at] of after) {
    if (!(
      id.length <= GONE_KEY_MAX &&
      typeof at === "string" &&
      at.length <= GONE_AT_MAX
    )) {
      return "A deleted comment is its pin's id and when it was deleted.";
    }
  }
  return null;
}

/**
 * Why a person's held note (`meta.heldNote`, {@link HeldNote}) may not be
 * kept, or null: gone, or its time and words within a comment's bound. The
 * hub's word on Send all's note (hub artifacts/sync.ts).
 */
export const heldNoteProblem = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }
  const note = value as { at?: unknown; text?: unknown } | null;
  if (!(
    note &&
    typeof note === "object" &&
    typeof note.at === "string" &&
    typeof note.text === "string"
  )) {
    return "A held note is its time and its words, so nothing was sent.";
  }
  return note.text.length > COMMENT_LIMITS.text
    ? `A note holds ${COMMENT_LIMITS.text.toLocaleString()} characters, so nothing was sent. Shorten it, then send again.`
    : null;
};
