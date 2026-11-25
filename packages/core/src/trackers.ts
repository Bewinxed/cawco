/**
 * Where a project's tasks live (Projects spec D2, §5.2): CawCo's files alone,
 * or GitHub Issues or Linear as the record of each task's issue fields.
 * Every task stays a file; with a tracker, the hub's sync (hub sync.ts)
 * keeps each linked task's title, description, labels, stage and comments
 * one record with its issue, and CawCo keeps rank, edges, attempts and
 * checks.
 */

import type { GhRepo } from "./connections";

export const TRACKERS = ["cawco", "github", "linear"] as const;
/** Where a project's tasks live: CawCo's files alone, or an outside tracker beside them (hub sync.ts). */
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
 * Which way a binding syncs (hub sync.ts): `both` keeps each linked
 * task and its issue one record and files each new task as an issue;
 * `inbound` brings issues in as tasks and writes nothing to the tracker.
 */
export const TRACKER_DIRECTIONS = ["both", "inbound"] as const;
export type TrackerDirection = (typeof TRACKER_DIRECTIONS)[number];

/**
 * Where a project's sync stands: `syncing` until its first poll answers,
 * `synced` while the tracker answers, `refused` when the tracker refused the
 * connection's sign-in or scope, whose words are its `reason`.
 */
export type TrackerSyncState = "syncing" | "synced" | "refused";

/** One option of a GitHub Project's single-select Status field. */
export interface StatusOption {
  /** GitHub's option id (`ProjectV2SingleSelectFieldOption.id`). */
  id: string;
  name: string;
}

/**
 * A GitHub Project (v2) a GitHub binding carries its stages on, through the
 * Project's single-select field named Status (PRD §5.2: "With GitHub, stages
 * map onto a Projects single-select field"). Issues' open and closed carry
 * only open against done or dropped; Status carries every stage.
 */
export interface GithubProject {
  /** Its Status field's node id; null when the Project has no single-select Status. */
  fieldId: string | null;
  /** GitHub's node id for the Project. */
  id: string;
  number: number;
  /** Its Status field's options, in GitHub's order. */
  options: StatusOption[];
  title: string;
  url: string;
}

/**
 * The stages the hub has made sure of a Status option for on one GitHub
 * Project (hub sync.ts): each had an option named as it, or the hub
 * added one. A stage named here is never given one again, so an option the
 * person removes or renames on GitHub stays as they left it.
 */
export interface GithubStatusStages {
  /** The Project's node id: another Project starts again from none. */
  projectId: string;
  /** The stages' names, as stages.md names them. */
  stages: string[];
}

/**
 * The Status options the hub last added to one GitHub Project (hub
 * sync.ts), each named as a board column the Project had no option for.
 * Kept on the binding and read beside it, so the person finds it where the
 * board's link is.
 */
export interface GithubStatusesAdded {
  /** When they were added, ms epoch. */
  at: number;
  /** The options added, each named as its column. */
  options: string[];
  /** The Project's node id: another Project shows none. */
  projectId: string;
}

/** A GitHub Project a connection reaches, offered in the binding's form. */
interface GithubProjectChoice {
  fieldId: string | null;
  id: string;
  /** Linked to the bound repository on GitHub: the form's first pick. */
  linked: boolean;
  number: number;
  options: StatusOption[];
  title: string;
  url: string;
}

/** What a GitHub connection reaches of a repository owner's Projects: its Projects, or GitHub's refusal in its words. */
export interface GithubProjectsView {
  projects: GithubProjectChoice[];
  /** GitHub's words when the connection may not read the owner's Projects; null when it may. */
  refused: string | null;
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Status option a stage puts its issue's Project item in: the option
 * named as the stage, ignoring case (the hub adds one for each stage as it
 * binds, providers github/writes.ts `board.columns`); null when it
 * has none, and Status is left alone.
 */
export const statusOptionFor = (
  stage: string,
  project: Pick<GithubProject, "options">
): string | null =>
  project.options.find((option) => sameName(option.name, stage))?.id ?? null;

/** A project's binding: one connection and one target on it. */
interface TrackerBindingView {
  /** When the project was bound, ms epoch: issues opened after it become tasks. */
  boundAt: number;
  /** The connection's name (hub connections.ts). */
  connection: string;
  /** Which way it syncs: with `inbound`, nothing is written to the tracker. */
  direction: TrackerDirection;
  /** GitHub: the Project its stages show on through Status; null when none is set. */
  githubProject: GithubProject | null;
  /**
   * GitHub: why stages do not show on a Project, in GitHub's words (the
   * connection may not read or write the owner's Projects); null when
   * nothing stops them. Issues sync either way.
   */
  githubProjectReason: string | null;
  /**
   * GitHub: the Status options the hub last added to the Project, and when;
   * null when it has added none to this one.
   */
  githubStatusesAdded: Pick<GithubStatusesAdded, "at" | "options"> | null;
  /**
   * GitHub: why the Project has no Status option yet for a stage that lacks
   * one, in GitHub's words (it refused adding them); null when nothing
   * stopped them. Every other stage's Status syncs either way, and Sync now
   * asks again.
   */
  githubStatusesRefused: string | null;
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
  /** GitHub: the repository as a repository picker draws it (its owner, description, when it was updated); absent for a Linear team. */
  repo?: GhRepo;
  url: string;
}
