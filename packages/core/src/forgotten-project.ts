/**
 * A project forgotten, as the hub lists it for bringing back
 * (`GET /api/projects/forgotten`) and answers a restore
 * (`POST /api/projects/:id/restore`); hub project-trash.ts keeps them.
 */

import type { PlaceProject } from "./place-nesting";

/** The most characters a project's name has: create, restore and edit all bound it so. */
export const PROJECT_NAME_LENGTH = 200;

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

/**
 * A place of a forgotten project on disk that deleting it with its files
 * (`POST /api/projects/:id/discard`, `fromDisk`) removes: a checkout on a
 * machine, or its folder in the hub's trash.
 */
export interface ForgottenPlace {
  /** `checkout`: a folder on a machine; `hub`: its folder in the hub's trash. */
  kind: "checkout" | "hub";
  /** The machine's id; `hub` for the hub's own trash. */
  machineId: string;
  /** The machine's name as the hub holds it now; its id when the hub holds none. */
  machineName: string;
  /** Absolute on its machine. */
  path: string;
  /** The live projects whose checkout holds this folder: they lose these files too (place-nesting.ts). Empty for the hub's own. */
  within: PlaceProject[];
}

/**
 * What a folder forgotten before the hub kept records says about the
 * project, read off its files: the hub kept nothing else of it. Its task
 * count is {@link ForgottenBrings.tasks}.
 */
export interface ForgottenFolderHints {
  /** When a file in it last changed, ms since the epoch; null when it holds none outside git's own. */
  changedAt: number | null;
  /** The first heading of its AGENTS.md, but the stub's own `AGENTS.md`; null when it has none. */
  heading: string | null;
  /** Its newest task, open or archived, by number; null when it has none. */
  newestTask: { number: number; title: string } | null;
  /** Its decision pages' names, sorted. */
  pages: string[];
  /** Its stages as its stages.md names them; none when it has no stages.md or it does not read. */
  stages: string[];
}

export interface ForgottenProject {
  /** What it brings back. */
  brings: ForgottenBrings;
  /** The presence id of the client that forgot it; null when none said, or before the hub kept it. */
  by: string | null;
  /** When it was forgotten, ms since the epoch. */
  forgottenAt: number;
  /**
   * What its folder says about it, for one forgotten before the hub kept
   * records (`name` null); null for every other.
   */
  hints: ForgottenFolderHints | null;
  id: string;
  /** Null: forgotten before the hub kept its name; a restore names it. */
  name: string | null;
  /**
   * Every place deleting it with its files removes, as the delete itself
   * reads them (hub project-trash.ts `diskPlaces`): its folders in the
   * hub's trash, then its checkouts on machines still in the fleet.
   */
  places: ForgottenPlace[];
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
