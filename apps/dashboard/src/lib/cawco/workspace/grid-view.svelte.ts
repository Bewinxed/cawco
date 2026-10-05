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

/** The tree's shape as it stood: branches copied, groups themselves (they are keyed by id and carry their own tabs). */
function snapshot(node: PaneNode): PaneNode {
  if (node.t === "l") {
    return node;
  }
  return {
    t: "b",
    id: node.id,
    dir: node.dir,
    sizes: [...node.sizes],
    kids: node.kids.map(snapshot),
  };
}

const idsIn = (node: PaneNode, out = new Set<string>()): Set<string> => {
  out.add(node.id);
  if (node.t === "b") {
    for (const kid of node.kids) {
      idsIn(kid, out);
    }
  }
  return out;
};

const branchesIn = (
  node: PaneNode,
  out = new Map<string, BranchNode>()
): Map<string, BranchNode> => {
  if (node.t === "b") {
    out.set(node.id, node);
    for (const kid of node.kids) {
      branchesIn(kid, out);
    }
  }
  return out;
};

export interface Ghost {
  /**
   * Each branch that lost a group, and the share each of its boxes is going
   * to once the tree is drawn as it now is: nothing for the group that left.
   */
  changes: Map<string, number[]>;
  /** The tree as it was, drawn while the groups that left collapse. */
  tree: PaneNode;
}

/**
 * What a change took away, as the tree to go on drawing, or nothing when it
 * did anything else (added a group, rearranged): only a group leaving is
 * given a motion of its own.
 */
function ghostOf(before: PaneNode, now: PaneNode): Ghost | null {
  const nowIds = idsIn(now);
  const beforeIds = idsIn(before);
  for (const id of nowIds) {
    if (!beforeIds.has(id)) {
      return null;
    }
  }
  const nowBranches = branchesIn(now);
  /** Whether the group or anything under the branch is still in the tree. */
  const alive = (node: PaneNode): boolean =>
    nowIds.has(node.id) || (node.t === "b" && node.kids.some(alive));
  /** The box the kid (or what is left of it) is in, among the branch's kids as they now stand. */
  const nowIndex = (branch: BranchNode, kid: PaneNode): number => {
    const holds = (node: PaneNode): boolean =>
      node.id === kid.id ||
      (kid.t === "b" && kid.kids.some((inner) => idsIn(node).has(inner.id)));
    return branch.kids.findIndex(holds);
  };
  const changes = new Map<string, number[]>();
  for (const branch of branchesIn(before).values()) {
    if (branch.kids.every(alive)) {
      continue;
    }
    const grown = nowBranches.get(branch.id);
    const survivors = branch.kids.filter(alive);
    if (!grown && survivors.length !== 1) {
      return null;
    }
    changes.set(
      branch.id,
      branch.kids.map((kid) => {
        if (!alive(kid)) {
          return 0;
        }
        return grown ? (grown.sizes[nowIndex(grown, kid)] ?? 0) : ALL;
      })
    );
  }
  return changes.size > 0 ? { tree: before, changes } : null;
}

/** What was last drawn, to tell what a change took away. */
let was: PaneNode | null = null;
let held: Ghost | null = null;
let released = $state(0);
let letGo = 0;
/** The branches whose boxes have run to where they were going. */
const done = new Set<string>();

const ghost = $derived.by((): Ghost | null => {
  // The grid draws the tree again once the ghost is let go.
  if (released !== letGo) {
    letGo = released;
    held = null;
  }
  if (!browser) {
    return null;
  }
  const now = snapshot(workspace.root);
  const before = was;
  was = now;
  if (before && motionOk.current && signature(before) !== signature(now)) {
    held = ghostOf(before, now);
    done.clear();
  }
  return held;
});

/** What the tree is made of, in order: a change of it is a group coming or going. */
function signature(node: PaneNode): string {
  return node.t === "l"
    ? node.id
    : `${node.id}${node.dir}(${node.kids.map(signature).join(",")})`;
}

const drawn = $derived<PaneNode>(ghost?.tree ?? workspace.root);
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
  /** One branch's boxes have run; once every branch that lost a group has, draw the tree as it is. */
  finish(branchId: string): void {
    done.add(branchId);
    if (held && done.size >= held.changes.size) {
      released += 1;
    }
  },
};
