/**
 * Sessions as the tree they are: a delegate names the session that started
 * it (`parentInstanceId`) and hangs under it, depth by depth. One builder for
 * every list that shows delegates (the rail's projects, Working and
 * Finished), so they nest the same way everywhere.
 *
 * A list that can name sessions it does not hold (`context`) never leaves a
 * delegate on its own: when its parent is not in the list (in the other
 * tab, asleep), the parent is drawn as a context line in the delegate's
 * place, its delegates hanging off it, and one context line serves all of
 * them. A parent the fleet no longer knows has nothing to draw; its delegate
 * leads its own line.
 *
 * A top-level line stands where the first of its tree came in `rows`, so a
 * parent turning from context to a listed row (or back) keeps its place.
 */

export interface TreeRow {
  id: string;
  parentInstanceId?: string | null;
}

export interface TreeLine<T> {
  /** Not in the list: the parent of delegates that are, drawn for them. */
  context: boolean;
  /** 0 for a top-level session, 1 for its delegates, and so on. */
  depth: number;
  /** The first of its siblings: its elbow starts at its parent's glyph. */
  first: boolean;
  /** The last of its siblings: its elbow ends its parent's rail. */
  last: boolean;
  row: T;
  /**
   * The depths whose rails pass this line on their way to a later sibling
   * (an ancestor's, or its parent's when this line has delegates of its own
   * under it): each is drawn straight through this line.
   */
  through: number[];
}

/**
 * `rows` in tree order. `order` sorts one set of siblings; `under` names
 * whose children they are ("root" for the top level), for callers that hold
 * an order per list. `context` finds a session the list does not hold, to
 * stand in for a missing parent.
 */
export function tree<T extends TreeRow>(
  rows: T[],
  order: (siblings: T[], under: string) => T[] = (siblings) => siblings,
  context?: (id: string) => T | undefined
): TreeLine<T>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const standIns = new Set<string>();
  /** Every line, each missing ancestor just before its first delegate. */
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

  const parentOf = (row: T): string | null => {
    const parent = row.parentInstanceId;
    return parent && parent !== row.id && byId.has(parent) ? parent : null;
  };
  const topOf = (row: T): T => {
    const seen = new Set<string>([row.id]);
    let at = row;
    for (let up = parentOf(at); up && !seen.has(up); up = parentOf(at)) {
      seen.add(up);
      at = byId.get(up) as T;
    }
    return at;
  };

  const children = new Map<string, T[]>();
  const roots: T[] = [];
  const rooted = new Set<string>();
  for (const row of members) {
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
    if (!(parentOf(top) || rooted.has(top.id))) {
      rooted.add(top.id);
      roots.push(top);
    }
  }

  const out: TreeLine<T>[] = [];
  /** Depths whose rail is still open: an ancestor with siblings still to come. */
  const open: number[] = [];
  const walk = (list: T[], depth: number, under: string): void => {
    const sorted = order(list, under);
    for (const [at, row] of sorted.entries()) {
      const last = at === sorted.length - 1;
      out.push({
        row,
        context: standIns.has(row.id),
        depth,
        first: at === 0,
        last,
        through: [...open],
      });
      const kids = children.get(row.id);
      if (kids) {
        // This line's own rail carries on past its delegates when it has
        // siblings after it.
        if (depth > 0 && !last) {
          open.push(depth);
        }
        walk(kids, depth + 1, row.id);
        if (depth > 0 && !last) {
          open.pop();
        }
      }
    }
  };
  walk(roots, 0, "root");
  return out;
}
