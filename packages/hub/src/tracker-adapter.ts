/**
 * What the tracker sync (tracker.ts) asks of GitHub Issues and of Linear
 * alike: one target's issues, their states and comments, read and written
 * through each service's own SDK (tracker-github.ts, tracker-linear.ts).
 *
 * - **States.** An issue's state has one of Linear's six categories:
 *   "statuses belong to fixed categories: triage, backlog, unstarted,
 *   started, completed, canceled" (linear.app/docs/configuring-workflows, the
 *   PRD's §10). GitHub's open is `unstarted`, its closed `completed` or, as
 *   "not planned" or a duplicate, `canceled` (docs.github.com, update an
 *   issue: `state_reason` "completed, not_planned, duplicate, reopened").
 * - **Stages.** A task's stage puts its issue in the state named as the
 *   stage, else the first state of its kind's category in the tracker's own
 *   order. An issue's state puts its task in the stage it is in already when
 *   the two agree, else the stage named as the state, else the first stage
 *   of the category's kind. So a stage the tracker has no state for (GitHub's
 *   open stands for every open kind) never moves its task off on the way back.
 * - **Headings.** A task file's description cannot hold a `## ` heading, nor
 *   a comment a `## ` or `### ` one (tasks.ts `block`, `commentText`): each
 *   would open a section of the file. An issue's body often does. Headings
 *   go one level deeper in a description and two in a comment, and back, so
 *   both sides keep every byte (an H6 is seven or eight #s in the file).
 */
import type { StageKind, TrackerTarget } from "@cawco/core";
import type { Stage } from "./stages";

/** Linear's six categories, which GitHub's states take too. */
export type StateType =
  "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";

/** One state an issue can be in on its tracker. */
export interface IssueState {
  name: string;
  /** What names it to the tracker: `open`, `closed:completed`, a Linear state's id. */
  token: string;
  type: StateType;
}

/** An issue as the sync reads it. */
export interface Issue {
  createdAt: number;
  /** Its body, as the tracker holds it (markdown), trimmed. */
  description: string;
  /** GitHub: its number; Linear: its id. */
  key: string;
  /** Its labels' names, sorted. */
  labels: string[];
  /**
   * Who opened it: their name, and, when the tracker does not vouch for
   * them, who they are in words (GitHub: no owner, member or collaborator
   * of the repository; Linear: an integration's, no member behind it).
   * Their issue's task waits for a person before any agent takes it.
   */
  opener: { name: string; unvouched: string | null };
  /** `#12`, `ENG-123`. */
  ref: string;
  state: IssueState;
  title: string;
  updatedAt: number;
  url: string;
}

/** A comment on one of the target's issues. */
export interface IssueComment {
  /** Who wrote it, as the tracker names them. */
  author: string;
  body: string;
  createdAt: number;
  id: string;
  /** The issue it is on, by its key. */
  issueKey: string;
  /** Who wrote it, in words, when the tracker does not vouch for them (as {@link Issue}'s opener); null when it does. */
  unvouched: string | null;
}

/** What a new issue is made of. */
export interface IssueDraft {
  description: string;
  labels: string[];
  state: IssueState;
  title: string;
}

/** What a change to an issue sets; what it leaves out stays. */
export type IssuePatch = Partial<IssueDraft>;

/** Where a list stands: the newest change it took in, and the tracker's ETag for it. */
export interface ListCursor {
  etag: string | null;
  since: number;
}

/** A list read since a cursor: what changed, and the cursor to keep; `unchanged` when the tracker said nothing moved. */
export type Listed<T> =
  { cursor: ListCursor; items: T[]; kind: "read" } | { kind: "unchanged" };

/** An issue as a write names it: its key for the tracker, its ref for sentences. */
type IssueRef = Pick<Issue, "key" | "ref">;

export interface TrackerAdapter {
  /** The target's issues changed since the cursor, pull requests left out. */
  changed: (cursor: ListCursor) => Promise<Listed<Issue>>;
  /** Writes a comment on an issue, as `author` where the tracker lets the app say so. */
  comment: (
    issue: IssueRef,
    author: string,
    body: string
  ) => Promise<{ createdAt: number; id: string }>;
  /** The target's issues' comments written since the cursor, oldest first. */
  comments: (cursor: ListCursor) => Promise<Listed<IssueComment>>;
  create: (draft: IssueDraft) => Promise<Issue>;
  /** The target as the connection reaches it: reading it is the first proof of the connection's scope. */
  describe: () => Promise<TrackerTarget>;
  /** One issue by its key; null when it is gone (deleted, moved off the target, or not an issue). */
  issue: (key: string) => Promise<Issue | null>;
  /** The key of the issue a URL names on this target; undefined when it names none here. */
  keyOf: (url: string) => Promise<string | undefined>;
  /** Every state the target's issues can be in, in the tracker's own order. */
  states: () => Promise<IssueState[]>;
  update: (issue: IssueRef, patch: IssuePatch) => Promise<Issue>;
}

/**
 * Why a tracker refused, in its own words with what the person can do:
 * `sign-in` (the connection's key or app was refused), `scope` (the
 * connection reaches the service but may not do this), `rate` (its rate
 * limit holds calls back until `resumeAt`), `input` (the tracker would not
 * take what was sent), `unreachable` (no answer).
 */
export class TrackerRefusal extends Error {
  readonly kind: "sign-in" | "scope" | "rate" | "input" | "unreachable";
  readonly resumeAt: number | null;
  constructor(
    kind: TrackerRefusal["kind"],
    message: string,
    resumeAt: number | null = null
  ) {
    super(message);
    this.kind = kind;
    this.resumeAt = resumeAt;
  }
}

/** The categories a kind's stage puts its issue in, the first the tracker has. */
const KIND_TYPES: Readonly<Record<StageKind, readonly StateType[]>> = {
  todo: ["unstarted", "backlog", "triage"],
  active: ["started", "unstarted"],
  waiting: ["started", "unstarted"],
  you: ["started", "unstarted"],
  done: ["completed"],
  dropped: ["canceled"],
};

/**
 * The kind of stage a category puts its task in. Triage waits for you:
 * Linear's issues there are "before they are added to your team's
 * workflow" (linear.app/docs/triage), and a `todo` stage is the
 * dispatcher's to start.
 */
const TYPE_KINDS: Readonly<Record<StateType, StageKind>> = {
  triage: "you",
  backlog: "todo",
  unstarted: "todo",
  started: "active",
  completed: "done",
  canceled: "dropped",
};

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The state a stage puts its issue in; undefined when the tracker has none for its kind. */
export const stateFor = (
  stage: Pick<Stage, "kind" | "name">,
  states: readonly IssueState[]
): IssueState | undefined =>
  states.find((state) => same(state.name, stage.name)) ??
  KIND_TYPES[stage.kind]
    .map((type) => states.find((state) => state.type === type))
    .find((state) => state !== undefined);

/**
 * The stage an issue's state puts its task in: `current` when they agree
 * (the state is the one `current` puts its issue in, or is named as it),
 * else the stage named as the state, else the first stage of its category's
 * kind; undefined when the project has none.
 */
export const stageFor = (
  state: IssueState,
  current: Pick<Stage, "kind" | "name"> | undefined,
  stages: readonly Stage[],
  states: readonly IssueState[]
): Pick<Stage, "kind" | "name"> | undefined => {
  if (
    current &&
    (same(current.name, state.name) ||
      stateFor(current, states)?.token === state.token)
  ) {
    return current;
  }
  return (
    stages.find((stage) => same(stage.name, state.name)) ??
    stages.find((stage) => stage.kind === TYPE_KINDS[state.type])
  );
};

const FENCE = /^\s*(```|~~~)/u;
const HEADING = /^(#{2,})(?=\s|$)/u;

/** Each heading line outside a code fence, its #s counted and changed by `change`. */
const headings = (text: string, change: (level: number) => number): string => {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return line;
      }
      const found = fenced ? null : HEADING.exec(line);
      return found
        ? `${"#".repeat(change(found[1].length))}${line.slice(found[1].length)}`
        : line;
    })
    .join("\n");
};

/** Text from a tracker as a task file holds it: every heading below H1 `by` levels deeper. */
export const intoFile = (text: string, by: 1 | 2): string =>
  headings(text.replaceAll("\r\n", "\n").trim(), (level) => level + by);

/** A task file's text as its tracker holds it: each heading `by` levels back up. */
export const outOfFile = (text: string, by: 1 | 2): string =>
  headings(text.trim(), (level) => (level >= 2 + by ? level - by : level));

/** Labels as the sync compares them: each once, sorted. */
export const labelSet = (labels: readonly string[]): string[] =>
  [...new Set(labels.map((label) => label.trim()).filter(Boolean))].sort();
