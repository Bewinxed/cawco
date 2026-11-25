/**
 * An external item on a task (tsk-128): a GitHub issue, pull request or
 * discussion, or a Linear issue, linked to a task as data, and a comment
 * written on one, carried onto the task as data.
 *
 * - **The link** lives twice, by one rule ("files are the truth", hub
 *   tasks.ts): the task file keeps each item's URL (`issue:` the record,
 *   `links:` the rest), and the hub's `task_links` keeps what the source
 *   holds of it (title, state, author, labels), read again whenever it
 *   changes. A URL names its source, kind and number by itself
 *   (@cawco/providers registry.ts `itemOfUrl`), so a hub rebuilt from the files alone knows every
 *   link.
 * - **The comment** is one `## Comments` entry whose heading names its
 *   source and URL (`### bewinxed · github · <url> · <time>`, hub
 *   task-file.ts), and a row of `external_comments` keyed by the source's
 *   own id, so it is filed once and an edit rewrites it in place.
 */

import type {
  ExternalActor,
  ExternalState,
  LinkKind,
  ProviderId,
} from "@cawco/providers/provider";

export type { ExternalActor, ExternalState } from "@cawco/providers/provider";

/**
 * `record`: the task's fields are one record with it (the file's `issue:`,
 * the tracker sync's). The rest are GitHub's and Linear's own link words;
 * a URL a person or session writes into `links:` is `related`.
 */
export type LinkMode = "record" | "closes" | "refs" | "related";

/** One external item a task links, as the board draws it. */
export interface ExternalRef {
  author: ExternalActor | null;
  /**
   * Set on a task's record link while the tracker sync's baseline with its
   * issue (what the two last agreed on) does not read: its sync is held,
   * nothing pulled into the task or pushed from it, until a sync finds the
   * task and the issue agreeing.
   */
  baselineUnread?: true;
  /** The source's own id: GitHub's node id, Linear's uuid; empty until the item was read. */
  id: string;
  kind: LinkKind;
  labels: string[];
  mode: LinkMode;
  /** GitHub's #12; null on Linear. */
  number: number | null;
  /** Why the last read of it stopped short, in the source's words; null when it went through. */
  problem: string | null;
  /** `#12`, `ENG-123`. */
  ref: string;
  source: ProviderId;
  /** Its state as the source last said it; null until the item was read. */
  state: ExternalState | null;
  /** The source's own word: "Open", "Closed", "In Progress"; empty until read. */
  stateName: string;
  /** When the hub last read it from the source, ms epoch; null before it first did. */
  syncedAt: number | null;
  /** Empty until the item was read. */
  title: string;
  /** When the source last changed it, ms epoch; null before it was read. */
  updatedAt: number | null;
  url: string;
}

/** A link as a task's line on the board carries it: the card draws its mark and ref. */
export type TaskLinkSummary = Pick<
  ExternalRef,
  "kind" | "mode" | "ref" | "source" | "state" | "url"
>;

/** A comment written on an outside source and carried onto a task. */
export interface ExternalComment {
  /** When it was written on the source, ms epoch. */
  at: number;
  author: ExternalActor;
  /** `in`: written on the source, added to the task; `out`: written on the task, posted to the source. */
  direction: "in" | "out";
  /** The source's last edit of it, ms epoch; null when never edited. */
  editedAt: number | null;
  /** The source's own id for it: GitHub's comment number, Linear's uuid. */
  externalId: string;
  source: ProviderId;
  /** Where it reads on the source: the item's URL with the comment's anchor. */
  url: string;
}

/** Someone a source names by login alone: a person, nothing else known yet. */
export const actorNamed = (
  source: ProviderId,
  login: string
): ExternalActor => ({
  source,
  login,
  name: null,
  avatarUrl: null,
  url: null,
  kind: "person",
  memberId: null,
});
