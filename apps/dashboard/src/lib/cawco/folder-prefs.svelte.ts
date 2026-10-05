/**
 * What the reader has said about a directory, over what the app inferred:
 * whether its folder in the rail is shut, and which hue it wears. All the same kind of claim — "this directory, to me, is
 * this" — so they live in one document under one key. A folder shut in the
 * rail stays shut across reloads because the answer is kept here.
 *
 * Keyed by cwd, the one name a directory cannot be renamed out of, which is
 * also what `identity.ts` hashes: an override and the default it replaces are
 * always talking about the same thing.
 */

import type { ProjectRow } from "./client.svelte";
import { identityHue } from "./identity";
import { readJson, writeJson } from "./storage";

export interface FolderPref {
  /** The rail's folder for this directory is shut. */
  collapsed?: true;
  /** A hue chosen by hand; without one, the cwd's hash chooses. */
  hue?: number;
}

const KEY = "cawco-folder-prefs";

function read(): Record<string, FolderPref> {
  const stored = readJson<unknown>(KEY, {});
  // `stored` is unknown at runtime — localStorage can hold a corrupted or non-object JSON value.
  return stored && typeof stored === "object"
    ? (stored as Record<string, FolderPref>)
    : {};
}

// Module scope, so every surface that draws a folder — rail, board, peek pane,
// tabs — is reading the same answer rather than its own copy of it.
const prefs = $state<Record<string, FolderPref>>(read());
const PROJECT_KEY = "cawco-project-folds";
const folds = $state<Record<string, true>>(readJson(PROJECT_KEY, {}));

const save = (): void => {
  writeJson(KEY, prefs);
};

/** Merges one field in, and drops the record once it says nothing at all. */
function edit(cwd: string, patch: FolderPref): void {
  const next: FolderPref = { ...prefs[cwd], ...patch };
  for (const [field, value] of Object.entries(next)) {
    if (value === undefined) {
      delete next[field as keyof FolderPref];
    }
  }
  if (Object.keys(next).length === 0) {
    delete prefs[cwd];
  } else {
    prefs[cwd] = next;
  }
  save();
}

export const folderPrefs = {
  /** Consume old folder folds once, assigning each to its oldest project. */
  migrateProjects(projects: ProjectRow[]): void {
    if (projects.length === 0) {
      return;
    }
    let changed = false;
    for (const [cwd, pref] of Object.entries(prefs)) {
      if (!pref.collapsed) {
        continue;
      }
      const [owner] = projects
        .filter((project) => project.cwd === cwd)
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
        );
      if (owner) {
        folds[owner.id] = true;
      }
      // biome-ignore lint/performance/noDelete: one-time migration must remove the old field from persisted JSON.
      delete pref.collapsed;
      if (Object.keys(pref).length === 0) {
        delete prefs[cwd];
      }
      changed = true;
    }
    if (changed) {
      save();
      writeJson(PROJECT_KEY, folds);
    }
  },
  collapsed: (id: string): boolean => folds[id] === true,
  setCollapsed(id: string, collapsed: boolean): void {
    if (collapsed) {
      folds[id] = true;
    } else {
      delete folds[id];
    }
    writeJson(PROJECT_KEY, folds);
  },
  /** The hue this directory wears: the chosen one, else the hashed one. */
  hue: (cwd: string): number => prefs[cwd]?.hue ?? identityHue(cwd),
  /** Only the chosen one — what the picker rings, and what "auto" clears. */
  chosenHue: (cwd: string): number | undefined => prefs[cwd]?.hue,
  setHue(cwd: string, hue: number | undefined): void {
    edit(cwd, { hue });
  },
};

/**
 * Inline style assigning the directory's identity hue — the override where
 * there is one. Every surface that colours by identity goes through this.
 */
export function identityVar(cwd: string): string {
  return `--identity-h: ${folderPrefs.hue(cwd)}`;
}
