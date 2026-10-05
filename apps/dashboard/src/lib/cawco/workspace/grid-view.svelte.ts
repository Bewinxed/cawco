/**
 * What the grid is drawing, which is not always the workspace's tree: a
 * split that has just closed is still drawn, its leaving group on its way to
 * nothing, until its motion has run (PaneGrid). The top bar's columns, the
 * groups that take their strip from the bar, and the grid itself all read it
 * here, so they agree on the same tree in the same pass.
 *
 * Derived rather than set from an effect: a ghost set a step after the tree
 * would be drawn after it, and the groups rebuilt at their default shares.
 */
import { browser } from "$app/env";
import { motionOk } from "../motion/curves.svelte";
import {
  type BranchNode,
  type PaneNode,
  topLeaves,
  workspace,
} from "./workspace.svelte";

const ALL = 100;

interface Shape {
  dir: "h" | "v";
  id: string;
  kids: PaneNode[];
  sizes: number[];
  t: PaneNode["t"];
}

export interface Ghost {
  /** The branch as it was, drawn while the group that left collapses. */
  branch: BranchNode;
  /** Where each of its boxes is going. */
  to: number[];
}

const shapeOf = (of: PaneNode): Shape =>
  of.t === "b"
    ? {
        t: "b",
        id: of.id,
        dir: of.dir,
        sizes: [...of.sizes],
        kids: [...of.kids],
      }
    : { t: "l", id: of.id, dir: "h", sizes: [], kids: [] };

const idsOf = (shape: Shape) => shape.kids.map((kid) => kid.id).join(",");

/** A box's share once the grid draws the tree as it now is. */
function shareAfter(id: string, stays: string[], now: Shape): number {
  if (!stays.includes(id)) {
    return 0;
  }
  return now.t === "l" ? ALL : (now.sizes[stays.indexOf(id)] ?? 0);
}

/** What a change took away, as a branch to go on drawing, or nothing when it only added or rearranged. */
function ghostOf(before: Shape, now: Shape): Ghost | null {
  if (before.t !== "b") {
    return null;
  }
  const stays = now.t === "l" ? [now.id] : now.kids.map((kid) => kid.id);
  const ids = before.kids.map((kid) => kid.id);
  const sameBranch = now.t === "l" || now.id === before.id;
  const left = ids.filter((id) => !stays.includes(id));
  if (
    !sameBranch ||
    left.length === 0 ||
    stays.some((id) => !ids.includes(id))
  ) {
    return null;
  }
  return {
    branch: {
      t: "b",
      id: before.id,
      dir: before.dir,
      sizes: before.sizes,
      kids: before.kids,
    },
    to: ids.map((id) => shareAfter(id, stays, now)),
  };
}

/** What was last drawn, to tell what a change took away. */
let was: Shape | null = null;
let held: Ghost | null = null;
let released = $state(0);
let letGo = 0;

const ghost = $derived.by((): Ghost | null => {
  // The grid draws the tree again once the ghost is let go.
  if (released !== letGo) {
    letGo = released;
    held = null;
  }
  if (!browser) {
    return null;
  }
  const now = shapeOf(workspace.root);
  const before = was;
  was = now;
  if (
    before &&
    motionOk.current &&
    (before.t !== now.t || idsOf(before) !== idsOf(now))
  ) {
    held = ghostOf(before, now);
  }
  return held;
});

const drawn = $derived<PaneNode>(ghost?.branch ?? workspace.root);
const tops = $derived(topLeaves(drawn));

export const gridView = {
  /** The tree being drawn: the workspace's, or the one that just closed. */
  get drawn(): PaneNode {
    return drawn;
  },
  get ghost(): Ghost | null {
    return ghost;
  },
  /** The groups the top bar carries the tabs of. */
  get tops() {
    return tops;
  },
  /** Whether a group takes its tabs from the top bar. */
  hosts(leafId: string): boolean {
    return tops.some((leaf) => leaf.id === leafId);
  },
  /** The closing motion has run: draw the tree as it is. */
  release(): void {
    released += 1;
  },
};
