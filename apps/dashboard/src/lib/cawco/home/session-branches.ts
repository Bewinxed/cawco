/**
 * A session and the sessions it started, as every flat tree in the rail
 * hangs them under its row (Recent's sessions, a project's running ones):
 * its delegates newest first, at every depth, each level's split into the
 * ones listed and the ones behind its "N older" row (older.ts).
 */
import { topsIn } from "@cawco/core/project-membership";
import type { BoardRow } from "../links";
import { DELEGATE_WINDOW, listedOf, type Reading } from "../older";
import { tree } from "../tree";
import { lastAt } from "./home-state.svelte";

/** A session and the sessions it started (tree.ts), split by older.ts's rule. */
export interface Branch {
  children: Branch[];
  /** Every row under it, at any depth. */
  count: number;
  older: Branch[];
  recent: Branch[];
  row: BoardRow;
  under: BoardRow[];
}

/** `row`'s own branch over `under`, every row beneath it at any depth. */
export function branchOf(
  row: BoardRow,
  under: BoardRow[],
  reading: Reading
): Branch {
  const lines = tree([row, ...under], {
    order: (siblings) => [...siblings].sort((a, b) => lastAt(b) - lastAt(a)),
  });
  const byId = new Map<string, Branch>();
  const roots: Branch[] = [];
  for (const line of lines) {
    const node: Branch = {
      row: line.row,
      children: [],
      count: line.descendants.length,
      older: [],
      recent: [],
      under: line.descendants,
    };
    byId.set(line.row.id, node);
    const parent = line.parent ? byId.get(line.parent) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  for (const node of byId.values()) {
    if (node.children.length === 0) {
      continue;
    }
    const listed = listedOf(
      node.children.map((child) => child.row),
      (child) => byId.get(child.id)?.under ?? [],
      reading,
      DELEGATE_WINDOW
    );
    for (const child of node.children) {
      (listed.has(child.row.id) ? node.recent : node.older).push(child);
    }
  }
  return byId.get(row.id) ?? (roots[0] as Branch);
}

/** Whether the conversation in front is one of `trees`, or under one. */
export const inFront = (trees: Branch[], active: string | null): boolean =>
  active !== null &&
  trees.some(
    (node) =>
      node.row.id === active || node.under.some((row) => row.id === active)
  );

/** How many rows `trees` hold, themselves included. */
export const rowsIn = (trees: Branch[]): number =>
  trees.reduce((held, node) => held + 1 + node.count, 0);

/** Each top's delegates among `rows`, at any depth, the tops read off `byId`. */
export function delegatesByTop(
  rows: BoardRow[],
  byId: ReadonlyMap<string, BoardRow>
): Map<string, BoardRow[]> {
  const topOf = topsIn(byId);
  const under = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const top = topOf(row);
    if (top !== row) {
      const held = under.get(top.id);
      if (held) {
        held.push(row);
      } else {
        under.set(top.id, [row]);
      }
    }
  }
  return under;
}
