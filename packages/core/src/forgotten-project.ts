/**
 * A project forgotten, as the hub lists it for bringing back
 * (`GET /api/projects/forgotten`) and answers a restore
 * (`POST /api/projects/:id/restore`); hub project-trash.ts keeps them.
 */

/** What bringing a forgotten project back brings, counted. */
export interface ForgottenBrings {
  /** The account its sessions start on, by id; null: the fleet's routing, or none kept. */
  account: string | null;
  /** Its browsers, each stopped with its profile (its sign-ins) kept on its machine. */
  browsers: number;
  /** Its folder on the hub, history and all: its task files, stages, pages' sources, memory and design. */
  folder: boolean;
  /** Memory documents scoped to it alone. */
  memoryDocs: number;
  /** Its notes. */
  notes: number;
  /** Its pages. */
  pages: number;
  /** Its places: its folder on the hub and its checkouts. */
  places: number;
  /** Its routines. */
  routines: number;
  /** Every row it brings, of any table. */
  rows: number;
  /** Rules scoped to it. */
  rules: number;
  /** Sessions started from it, counted its own again. */
  sessions: number;
  /**
   * Its row and settings as they were. False for a project forgotten before
   * the hub kept them: its folder alone comes back, under a new row that
   * takes the name the restore gives it.
   */
  settings: boolean;
  /** Its tasks. */
  tasks: number;
  /**
   * A live project some of its tasks already live in, under that project's
   * numbers: a folder from before the hub kept records that may have been a
   * duplicate folded into it (hub project-merge.ts) but can't be told for
   * sure. Null for every other.
   */
  tasksIn: { id: string; name: string; tasks: number } | null;
}

export interface ForgottenProject {
  /** What it brings back. */
  brings: ForgottenBrings;
  /** The presence id of the client that forgot it; null when none said, or before the hub kept it. */
  by: string | null;
  /** When it was forgotten, ms since the epoch. */
  forgottenAt: number;
  id: string;
  /** Null: forgotten before the hub kept its name; a restore names it. */
  name: string | null;
}

/** A restore's answer: the project back, and what came back of it. */
export interface ProjectRestored {
  /** What came back. */
  brought: ForgottenBrings;
  id: string;
  /** Rows left out, by table: a row made since holds their key, or what they named went since. */
  left: Record<string, number>;
  name: string;
}
