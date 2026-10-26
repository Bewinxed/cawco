/**
 * The workspace's tree as it is kept and served: its shapes, and the one
 * reader of a kept copy, whole or none, never a part. The client store
 * (workspace.svelte.ts) reads localStorage's copy with it, and the layout's
 * server load (`(app)/+layout.server.ts`) the cookies', so the first paint
 * and hydration draw one tree. Nothing here is reactive: the server imports
 * it without the client store and its module-level `$state`.
 */
import type { HarnessKind } from "@cawco/core/harness";
import { z } from "zod";
import { SessionContextSchema } from "#lib/cawco/stored-shapes.js";

/** A split: two or more children laid out along one axis. */
export interface BranchNode {
  dir: "h" | "v";
  id: string;
  kids: PaneNode[];
  /** Percentages, one per child, summing to 100. Written by paneforge. */
  sizes: number[];
  t: "b";
}

/** A group of tabs with one showing — VS Code's editor group. */
export interface LeafNode {
  /** `null` is the fleet board: a leaf holding nothing is where you start. */
  active: string | null;
  id: string;
  /**
   * The tab in front and the tab it was opened from, while that holds: kept
   * from the open until another tab is shown, so closing it goes back to
   * where it came from (a browser's opener). Absent once forgotten.
   */
  opened?: { from: string; id: string } | null;
  t: "l";
  tabs: string[];
}

export type PaneNode = BranchNode | LeafNode;

/** How a stored conversation is addressed: which machine, which folder, which harness. */
export interface SessionContext {
  cwd: string;
  harness: HarnessKind;
  machine: string;
}

export interface WorkspaceV1 {
  /**
   * The address of every conversation the tree holds.
   *
   * This lives HERE, beside the ids that need it, rather than being looked
   * up in the working set — which is a most-recently-used record with a cap
   * on it, and evicts. The tree can hold more tabs than that cap remembers,
   * so an evicted conversation came back addressed by id alone, resolved to
   * a different session that happened to share it, and rendered as
   * unreachable. Two records of one fact, one of them allowed to forget.
   */
  ctx?: Record<string, SessionContext>;
  focusedLeaf: string;
  root: PaneNode;
  v: 1;
}

/** Whether a parsed value is actually a tree, and not merely JSON. */
export function isTree(node: unknown): node is PaneNode {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as Partial<BranchNode> & Partial<LeafNode>;
  if (n.t === "l") {
    return typeof n.id === "string" && Array.isArray(n.tabs);
  }
  if (n.t === "b") {
    return (
      typeof n.id === "string" &&
      (n.dir === "h" || n.dir === "v") &&
      Array.isArray(n.kids) &&
      n.kids.length > 0 &&
      n.kids.every(isTree)
    );
  }
  return false;
}

/** Each session's kept context that is still its shape. */
const CONTEXTS = z
  .record(z.string(), SessionContextSchema.optional().catch(undefined))
  .transform((all) =>
    Object.fromEntries(
      Object.entries(all).filter(
        (entry): entry is [string, SessionContext] => entry[1] !== undefined
      )
    )
  );

/** A kept tree, whole or null; its addresses (`ctx`) those still their shape. */
export function parseWorkspace(
  raw: string | null | undefined
): WorkspaceV1 | null {
  if (!raw) {
    return null;
  }
  try {
    const held: unknown = JSON.parse(raw);
    if (typeof held !== "object" || held === null) {
      return null;
    }
    const root: unknown = Reflect.get(held, "root");
    const focusedLeaf: unknown = Reflect.get(held, "focusedLeaf");
    const ctx: unknown = Reflect.get(held, "ctx");
    if (
      Reflect.get(held, "v") !== 1 ||
      !isTree(root) ||
      typeof focusedLeaf !== "string"
    ) {
      return null;
    }
    return {
      v: 1,
      root,
      focusedLeaf,
      ...(typeof ctx === "object" && ctx !== null
        ? { ctx: CONTEXTS.parse(ctx) }
        : {}),
    };
  } catch {
    return null;
  }
}

/** The addresses kept apart from the tree (the server's second cookie); none when unreadable. */
export function parseContexts(
  raw: string | null | undefined
): Record<string, SessionContext> {
  try {
    return CONTEXTS.catch({}).parse(JSON.parse(raw ?? "{}"));
  } catch {
    return {};
  }
}

/** Every group of the tree, in order. */
export function leavesOf(node: PaneNode, out: LeafNode[] = []): LeafNode[] {
  if (node.t === "l") {
    out.push(node);
  } else {
    for (const kid of node.kids) {
      leavesOf(kid, out);
    }
  }
  return out;
}

/** The tree drawn when none was kept: one empty group, `p0`, the server's and the client's alike. */
export const blankWorkspace = (): WorkspaceV1 => ({
  v: 1,
  root: { t: "l", id: "p0", tabs: [], active: null },
  focusedLeaf: "p0",
  ctx: {},
});
