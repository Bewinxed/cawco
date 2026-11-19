/**
 * Moving a project's folder and pointing a project at where its folder is
 * now, as the dashboard reads them (TOM T2 and T12): what the hub says will
 * happen before anything runs, a move while it runs, and what it did. The
 * dashboard's project details card draws them; the hub's Move files and
 * Locate folder routes answer them.
 */

/** What will happen, written from the computer and folder named, or what stands in the way and what to do. */
export type FolderForecast =
  | {
      state: "ready";
      /** Each line of What will happen, in order. */
      lines: string[];
    }
  | { state: "blocked"; todo: string; why: string };

/** One agent working in the folder now. */
export interface AgentHere {
  /** To another computer: whether it keeps its conversation, or why it continues from a summary and on which tool. */
  carry: { tool: string; way: "same" | "summary"; why: string | null };
  id: string;
  name: string;
  /** In the middle of a reply: it waits, and can be interrupted. */
  replying: boolean;
}

/** What moving a folder to the computer and folder named would do, before anything runs. */
export interface MovePlan {
  agents: AgentHere[];
  forecast: FolderForecast;
}

/** A move running: its stages, in order, with the one it is on. */
export interface MoveRun {
  at: number;
  /** Call off stands until the old folder starts to be removed. */
  callOff: boolean;
  /** A stage that failed: the tool's words, both folders' state. */
  failed: { folders: string; stage: string; words: string } | null;
  id: string;
  /** How far along the stage it is on: "1,204 of 8,310 files". */
  progress: string | null;
  stages: string[];
  state: "running";
  /** A computer away: the stage holds. */
  waitingFor: string | null;
}

/** What a finished or called-off move did. */
export interface MoveResult {
  agents: { name: string; resumed: boolean; why: string | null }[];
  checked: string;
  ended: string[];
  id: string;
  leftBehind: { name: string; why: string }[];
  state: "done";
}

/** What pointing a folder at the path named would do, and what CawCo can tell of that folder. */
export interface FindPlan {
  forecast: FolderForecast;
  /**
   * The project that already has the folder's codebase, when it is another:
   * What will happen asks before the two become one, naming both, and Locate
   * folder sends its id back as the person's yes. Null: no other project has it.
   */
  joins: { id: string; name: string } | null;
  /** What CawCo can tell: the same codebase, another, the same folder moved, or that it can't tell. */
  tell: string;
}

/** The four acts on a folder that take a step of their own. */
export type FolderAct = "move" | "locate" | "connect" | "copy";

/** What a folder is to the project: where agents begin, another of its folders, or the folder the hub keeps. */
export type FolderRole = "main" | "extra" | "builtin";
