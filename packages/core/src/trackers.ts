/**
 * Where a project's tasks live (Projects spec D2, §5.2): CawCo's files alone,
 * or GitHub Issues or Linear as the record of each task's issue fields.
 * Every task stays a file; with a tracker, the hub's sync (hub tracker.ts)
 * keeps each linked task's title, description, labels, stage and comments
 * one record with its issue, and CawCo keeps rank, edges, attempts and
 * checks.
 */

export const TRACKERS = ["cawco", "github", "linear"] as const;
export type Tracker = (typeof TRACKERS)[number];
/** A tracker that is an outside service. */
export type IssueTracker = Exclude<Tracker, "cawco">;

/** What one tracker is called where a person reads it. */
export const TRACKER_NAMES: Readonly<Record<Tracker, string>> = {
  cawco: "CawCo",
  github: "GitHub Issues",
  linear: "Linear",
};

/**
 * Where a project's sync stands: `syncing` until its first poll answers,
 * `synced` while the tracker answers, `refused` when the tracker refused the
 * connection's sign-in or scope, whose words are its `reason`.
 */
export type TrackerSyncState = "syncing" | "synced" | "refused";

/** A project's binding: one connection and one target on it. */
export interface TrackerBindingView {
  /** When the project was bound, ms epoch: issues opened after it become tasks. */
  boundAt: number;
  /** The connection's name (hub connections.ts). */
  connection: string;
  /** Issues linked to the project's tasks. */
  linked: number;
  /** When its last poll answered, ms epoch; null before its first. */
  polledAt: number | null;
  provider: IssueTracker;
  /** Why it is `refused`, or why its last poll stopped short, in the tracker's words; null when all went through. */
  reason: string | null;
  state: TrackerSyncState;
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target: string;
  /** What a person reads: `owner/repo`, or the team's key and name (`ENG · Engineering`). */
  targetName: string;
  targetUrl: string;
}

/** A project's tracker, as the dashboard reads it. */
export interface TrackerView {
  /** Set while the tracker is GitHub Issues or Linear. */
  binding: TrackerBindingView | null;
  tracker: Tracker;
}

/** A target a connection reaches, offered when a project is bound: a repository, or a team. */
export interface TrackerTarget {
  /** GitHub: `owner/repo`; Linear: the team's id. */
  id: string;
  /** `owner/repo`, or `ENG · Engineering`. */
  name: string;
  url: string;
}

/** A task's linked issue, as the task's view carries it. */
export interface TaskIssueLink {
  /** Why the last sync of this task stopped short, in the tracker's words; null when it went through. */
  problem: string | null;
  provider: IssueTracker;
  /** `#12` on GitHub, `ENG-123` on Linear. */
  ref: string;
  /** When this task and its issue last agreed, ms epoch; null before they first did. */
  syncedAt: number | null;
  url: string;
}
