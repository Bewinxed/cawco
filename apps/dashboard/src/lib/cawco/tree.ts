/**
 * Sessions as the tree they are: a delegate names the session that started
 * it (`parentInstanceId`) and hangs under it, depth by depth. One builder and
 * one collapse model for every list that nests sessions (the rail's
 * projects, Working and Finished), so they nest, fold and open the same way
 * everywhere. Nothing here knows what a row is beyond its id and its
 * parent's: a workflow run with its step sessions under it is the same tree.
 *
 * A list that can name rows it does not hold (`context`) never leaves a
 * child on its own: when its parent is not in the list (in the other tab,
 * asleep), the parent is drawn as a context line in its place, and so on up
 * the whole chain, each ancestor the list does not hold a context line of
 * its own. One context line serves all of its children. A parent nobody
 * knows any more has nothing to draw; its child leads its own line.
 *
 * Where a tree stands among the others is where one of its members stands
 * in `rows` (`anchor`): its first (the list's order is newest first, so the
 * tree stands at its newest member) or its last (at its oldest). Either way
 * a parent turning from context to a listed row, or back, keeps its place.
 */

export interface TreeRow {
  id: string;
  parentInstanceId?: string | null;
}

export interface TreeLine<T> {
  /** Not in the list: the parent of rows that are, drawn for them. */
  context: boolean;
  /** 0 for a top-level row, 1 for its children, and so on. */
  depth: number;
  /** Every listed row under this one, at any depth (context lines left out). */
  descendants: T[];
  /** The first of its siblings: its elbow starts at its parent's glyph. */
  first: boolean;
  /** The last of its siblings: its elbow ends its parent's rail. */
  last: boolean;
  /** The line it hangs under, or null at the top level. */
  parent: string | null;
  row: T;
  /**
   * The depths whose rails pass this line on their way to a later sibling
   * (an ancestor's, or its parent's when this line has children of its own
   * under it): each is drawn straight through this line.
   */
  through: number[];
}

export interface TreeOptions<T> {
  /** Where a tree stands: at the first of its members in `rows`, or the last. */
  anchor?: "first" | "last";
  /** Finds a row the list does not hold, to stand in for a missing parent. */
  context?: (id: string) => T | undefined;
  /**
   * Sorts one set of siblings; `under` names whose children they are
   * ("root" for the top level), for callers that hold an order per list.
   * Without it siblings keep the order of `rows`.
   */
  order?: (siblings: T[], under: string) => T[];
}

/**
 * Every row the tree draws, in `rows` order with each missing ancestor
 * lifted in (by `context`) just before its first child, and which of them
 * are stand-ins. `byId` gains the stand-ins.
 */
function liftChains<T extends TreeRow>(
  rows: T[],
  byId: Map<string, T>,
  context: TreeOptions<T>["context"]
): { members: T[]; standIns: Set<string> } {
  const standIns = new Set<string>();
  const members: T[] = [];
  for (const row of rows) {
    const chain: T[] = [];
    let child = row;
    let parent = row.parentInstanceId;
    while (context && parent && parent !== child.id && !byId.has(parent)) {
      const found = context(parent);
      if (!found) {
        break;
      }
      byId.set(parent, found);
      standIns.add(parent);
      chain.unshift(found);
      child = found;
      parent = found.parentInstanceId;
    }
    members.push(...chain, row);
  }
  return { members, standIns };
}

/**
 * Each line's listed rows below it: the lines after it, until one stands
 * no deeper than it does.
 */
function fillDescendants<T extends TreeRow>(lines: TreeLine<T>[]): void {
  for (const [at, line] of lines.entries()) {
    for (const below of lines.slice(at + 1)) {
      if (below.depth <= line.depth) {
        break;
      }
      if (!below.context) {
        line.descendants.push(below.row);
      }
    }
  }
}

/**
 * The row at the top of each row's chain of parents, among the rows `byId`
 * holds: the session a delegate's work comes down from. A row with no
 * parent, or whose parent `byId` does not hold, is its own top; a chain that
 * loops stops where it would repeat. The one walker for every caller that
 * places a row by its tree (the tree itself, a project's recent and older
 * split, which projects a row lists in).
 */
export function topsIn<T extends TreeRow>(
  byId: ReadonlyMap<string, T>
): (row: T) => T {
  return (row) => {
    const seen = new Set<string>([row.id]);
    let at = row;
    for (
      let up = at.parentInstanceId ? byId.get(at.parentInstanceId) : undefined;
      up && !seen.has(up.id);
      up = at.parentInstanceId ? byId.get(at.parentInstanceId) : undefined
    ) {
      seen.add(up.id);
      at = up;
    }
    return at;
  };
}

/** `rows` in tree order. */
export function tree<T extends TreeRow>(
  rows: T[],
  { anchor = "first", context, order }: TreeOptions<T> = {}
): TreeLine<T>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const { members, standIns } = liftChains(rows, byId, context);

  const parentOf = (row: T): string | null => {
    const parent = row.parentInstanceId;
    return parent && parent !== row.id && byId.has(parent) ? parent : null;
  };
  const topOf = topsIn(byId);

  const children = new Map<string, T[]>();
  /** Each top-level row, and where in `members` its tree is anchored. */
  const anchors = new Map<string, { at: number; row: T }>();
  for (const [at, row] of members.entries()) {
    const parent = parentOf(row);
    if (parent) {
      const siblings = children.get(parent);
      if (siblings) {
        siblings.push(row);
      } else {
        children.set(parent, [row]);
      }
    }
    const top = topOf(row);
    if (parentOf(top)) {
      continue;
    }
    // A tree's members come in `rows` order: the first one seen is its
    // first, and every later one moves a "last" anchor on.
    if (!anchors.has(top.id) || anchor === "last") {
      anchors.set(top.id, { at, row: top });
    }
  }
  const roots = [...anchors.values()]
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.row);

  const out: TreeLine<T>[] = [];
  /** Depths whose rail is still open: an ancestor with siblings still to come. */
  const open: number[] = [];
  const walk = (
    list: T[],
    depth: number,
    under: string,
    parent: string | null
  ): void => {
    const sorted = order ? order(list, under) : list;
    for (const [at, row] of sorted.entries()) {
      const last = at === sorted.length - 1;
      out.push({
        row,
        context: standIns.has(row.id),
        depth,
        descendants: [],
        first: at === 0,
        last,
        parent,
        through: [...open],
      });
      const kids = children.get(row.id);
      if (kids) {
        // This line's own rail carries on past its children when it has
        // siblings after it.
        if (depth > 0 && !last) {
          open.push(depth);
        }
        walk(kids, depth + 1, row.id, row.id);
        if (depth > 0 && !last) {
          open.pop();
        }
      }
    }
  };
  walk(roots, 0, "root", null);
  fillDescendants(out);
  return out;
}

/**
 * The rows of `rows` that hang from a root the list holds: a top-level row,
 * or a child whose whole chain of parents is in `rows` too. What a list
 * shows when it does not list work other sessions started on its own (the
 * Delegates switch off): a delegate under a listed parent stays in its
 * parent's tree, folded there with the parent's count; one whose parent
 * the list does not hold is left out, not lifted in as a context chain.
 */
export function rooted<T extends TreeRow>(rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept = new Map<string, boolean>();
  const keeps = (row: T, seen: Set<string>): boolean => {
    const known = kept.get(row.id);
    if (known !== undefined) {
      return known;
    }
    const parentId = row.parentInstanceId;
    const parent = parentId ? byId.get(parentId) : undefined;
    let keep = !parentId;
    if (parent && !seen.has(parent.id)) {
      seen.add(row.id);
      keep = keeps(parent, seen);
    }
    kept.set(row.id, keep);
    return keep;
  };
  return rows.filter((row) => keeps(row, new Set()));
}

/**
 * The lines a reader sees: every tree starts folded, and a line shows only
 * when every line it hangs under is open. `isOpen` is the reader's choice,
 * one id at a time.
 */
export function collapse<T extends TreeRow>(
  lines: TreeLine<T>[],
  isOpen: (id: string) => boolean
): TreeLine<T>[] {
  const out: TreeLine<T>[] = [];
  /** Below this depth everything is folded away, until the tree climbs back out. */
  let foldedBelow = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.depth > foldedBelow) {
      continue;
    }
    foldedBelow = Number.POSITIVE_INFINITY;
    out.push(line);
    // A context line is only drawn for a listed row under it, so a line
    // with no listed descendants has nothing hanging under it at all.
    if (line.descendants.length > 0 && !isOpen(line.row.id)) {
      foldedBelow = line.depth;
    }
  }
  return out;
}
