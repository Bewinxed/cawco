/** The hub's bounds on what a writer may leave in an artifact's doc. */

import { readFileSpot } from "../file-spot";
import {
  commentsFull,
  seenAnchorTooLong,
  seenTooManyAnchors,
} from "../words/comment-lines";
import {
  attachmentsProblem,
  CHANGES_LIMIT,
  COMMENT_LIMITS,
  isObject,
  type Pin,
  type ThreadEntry,
} from "./model";

/** A revision's key in the `seen` map: its number. */
const REVISION_KEY = /^\d{1,9}$/u;

/** Characters one anchor of a look holds. */
const SEEN_ANCHOR_MAX = 500;

/**
 * Why a person's `seen` map may not be kept; null when it may: `size`, the
 * looks it holds after their change, and `changed`, each look the change
 * wrote. A look the change left stood within these bounds already.
 */
export function seenProblem(
  size: number,
  changed: Iterable<[string, unknown]>
): string | null {
  if (size > 2) {
    return "The page keeps the looks of its latest revision only.";
  }
  for (const [revision, anchors] of changed) {
    if (!(
      REVISION_KEY.test(revision) &&
      Array.isArray(anchors) &&
      anchors.every((anchor) => typeof anchor === "string")
    )) {
      return "A look is a revision's list of the anchors seen.";
    }
    if (anchors.length > CHANGES_LIMIT) {
      return seenTooManyAnchors(CHANGES_LIMIT);
    }
    if (anchors.some((anchor) => anchor.length > SEEN_ANCHOR_MAX)) {
      return seenAnchorTooLong(SEEN_ANCHOR_MAX);
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

/**
 * Whether `value` holds a pin's parts (its id, number, kind, anchor and
 * thread), its bounds unread: a pin the hub refused for breaking one is
 * still a pin to list.
 */
export const hasPinParts = (value: unknown): value is Pin =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.number === "number" &&
  value.kind === "comment" &&
  isObject(value.anchor) &&
  Array.isArray(value.thread);

/** Whether `value` is a pin within the hub's bounds ({@link pinProblem}). */
export const isPin = (value: unknown): value is Pin =>
  pinProblem(value) === null;

/** Why a pin, read whole ({@link readPin}), may not be kept; null when it may. */
export function pinProblem(value: unknown): string | null {
  if (!(hasPinParts(value) && isObject(value.anchor))) {
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

/** Why a pin's head, kept under `key`, is not one: its parts are its own keys, never inside it, and it stands under its own id. */
const headProblem = (key: string, head: unknown): string | null =>
  isObject(head) &&
  typeof head.id === "string" &&
  head.id === key &&
  typeof head.number === "number" &&
  !("thread" in head) &&
  !("anchor" in head)
    ? null
    : "A pin's head is its id, number, kind, when and by whom, kept under its id; its place, resolve and thread are their own keys.";

/** Why an `entries` key and its value don't belong together: the key names its pin and the entry's own id. */
const entryKeyProblem = (key: string, entry: unknown): string | null =>
  isObject(entry) &&
  typeof entry.id === "string" &&
  key.endsWith(`:${entry.id}`)
    ? null
    : "An entry is kept under its pin's id and its own.";

/**
 * A person's change of a doc's pins, as {@link pinsProblem} reads it: what
 * the change wrote, the pins it leaves standing, and each pin it touched.
 * A part it left stood within the bounds already, so only what it wrote is
 * read again: the hub's check costs the change, not the doc (hub
 * artifacts/gate.ts).
 */
export interface PinsChange {
  /** The bytes every standing pin's thread holds after it ({@link threadBytes}). */
  bytes: number;
  /** The thread entries it wrote, by key. */
  entries: Iterable<[string, unknown]>;
  /** The heads it wrote, by key. */
  heads: Iterable<[string, unknown]>;
  /** The pins standing after it: each with its head and its place, and no tombstone. */
  standing: number;
  /** Each pin it touched that stands after it, whole, with its thread before it (none when it stood nowhere). */
  touched: Iterable<{ pin: Pin; was: readonly ThreadEntry[] | undefined }>;
}

/**
 * Why a person's change of a doc's pins may not be kept; null when it may.
 * Each part is its own key ({@link PIN_MAPS}): a head holds no place or
 * thread and stands under its own id, and an entry stands under its pin's
 * id and its own. The agent's entries are the agent's (comment_reply), so
 * a person's change keeps every one of them as it was. A pin `gone` names
 * is deleted, whatever the change wrote of it: the doc lets it go
 * ({@link honourDeletions}), so it is not read.
 */
export function pinsProblem(change: PinsChange): string | null {
  for (const [key, head] of change.heads) {
    const problem = headProblem(key, head);
    if (problem) {
      return problem;
    }
  }
  for (const [key, entry] of change.entries) {
    const problem = entryKeyProblem(key, entry);
    if (problem) {
      return problem;
    }
  }
  if (change.standing > COMMENT_LIMITS.pins) {
    return `An artifact keeps at most ${COMMENT_LIMITS.pins} pins.`;
  }
  if (change.bytes > COMMENT_LIMITS.bytes) {
    return commentsFull(change.bytes, COMMENT_LIMITS.bytes, "page");
  }
  const agents = (thread: readonly ThreadEntry[] | undefined) =>
    new Set(
      (thread ?? [])
        .filter((entry) => entry.by === "agent")
        .map((entry) => JSON.stringify(entry))
    );
  for (const { pin, was } of change.touched) {
    const problem = pinProblem(pin);
    if (problem) {
      return problem;
    }
    const now = agents(pin.thread);
    const then = agents(was);
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

/** A map's values by key, as the doc's `gone` is read: a Yjs map is one. */
interface KeyedValues {
  get: (key: string) => unknown;
  has: (key: string) => boolean;
}

/**
 * Why a person's change of the doc's `gone` (by pin id), `before` to
 * `after`, may not be kept; null when it may: `keys`, each key the change
 * wrote, and `size`, the tombstones `after` holds. A tombstone is written
 * once, by a delete, and stays as it was: a deletion is never undone.
 */
export function goneProblem(
  before: KeyedValues,
  after: KeyedValues,
  keys: Iterable<string>,
  size: number
): string | null {
  const written = [...keys];
  for (const id of written) {
    if (before.has(id) && after.get(id) !== before.get(id)) {
      return "A deleted comment stays deleted.";
    }
  }
  if (size > COMMENT_LIMITS.gone) {
    return `An artifact keeps at most ${COMMENT_LIMITS.gone} deleted comments.`;
  }
  for (const id of written) {
    const at = after.get(id);
    if (!(
      !after.has(id) ||
      (id.length <= GONE_KEY_MAX &&
        typeof at === "string" &&
        at.length <= GONE_AT_MAX)
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
  if (!(
    isObject(value) &&
    typeof value.at === "string" &&
    typeof value.text === "string"
  )) {
    return "A held note is its time and its words, so nothing was sent.";
  }
  return value.text.length > COMMENT_LIMITS.text
    ? `A note holds ${COMMENT_LIMITS.text.toLocaleString()} characters, so nothing was sent. Shorten it, then send again.`
    : null;
};
