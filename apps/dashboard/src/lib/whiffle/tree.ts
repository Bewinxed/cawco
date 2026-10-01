/**
 * Sessions as the tree they are: a delegate names the session that started
 * it (`parentInstanceId`) and hangs under it, depth by depth. One builder for
 * every list that shows delegates (the rail's projects, Working and
 * Finished), so they nest the same way everywhere.
 *
 * A delegate whose parent is not in the same list (filtered out, in the
 * other tab, sleeping) stands at the top level rather than being dropped: a
 * session the list can reach is never hidden because its parent is not on
 * screen.
 */

export interface TreeRow {
  id: string;
  parentInstanceId?: string | null;
}

export interface TreeLine<T> {
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
 * an order per list.
 */
export function tree<T extends TreeRow>(
  rows: T[],
  order: (siblings: T[], under: string) => T[] = (siblings) => siblings
): TreeLine<T>[] {
  const present = new Set(rows.map((row) => row.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    const parent = row.parentInstanceId;
    if (parent && present.has(parent) && parent !== row.id) {
      const siblings = children.get(parent);
      if (siblings) {
        siblings.push(row);
      } else {
        children.set(parent, [row]);
      }
    } else {
      roots.push(row);
    }
  }
  const out: TreeLine<T>[] = [];
  /** Depths whose rail is still open: an ancestor with siblings still to come. */
  const open: number[] = [];
  const walk = (list: T[], depth: number, under: string): void => {
    const sorted = order(list, under);
    sorted.forEach((row, at) => {
      const last = at === sorted.length - 1;
      out.push({ row, depth, first: at === 0, last, through: [...open] });
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
    });
  };
  walk(roots, 0, "root");
  return out;
}
