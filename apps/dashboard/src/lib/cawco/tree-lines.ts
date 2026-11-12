/**
 * A tree as one flat list (design.css `kit-tree`): every row an item of one
 * keyed each, so a row that changes parent (a regroup) is the same node and
 * only moves. Each row draws its own share of the nesting lines beside it
 * (TreeLine, `kit-tree-line`), the way VS Code's indent guides and headless
 * tree libraries draw a tree on flat rows: a row knows its depth and, for
 * each level above it, whether the line at that level runs on past it. The
 * same facts are the WAI-ARIA tree pattern's (`aria-level`,
 * `aria-posinset`, `aria-setsize`), which carry the nesting to a reader now
 * that no list sits inside another.
 *
 *   <ul class="kit-tree">
 *     {#each flatTree(roots, kids, key) as row (row.key)}
 *       <li class="kit-tree-row" {...lineAttrs(row.line)}
 *           style:--line-depth={row.line.depth}>
 *         <TreeLine line={row.line} />
 *         …the row…
 *
 * Where each line stands is layout's alone, in CSS (design.css
 * `kit-tree`): a row's depth and where its recipe stands its glyph, in
 * tokens, so the server's HTML draws every line where it stays.
 */
/** A row's place in its tree: what its share of the lines and its aria name. */
export interface Line {
  depth: number;
  /** The first child of its parent: its elbow leaves the parent's glyph. */
  first: boolean;
  /** The last child of its parent: its own rail ends at its elbow. */
  last: boolean;
  /** Its place among its parent's children, 1 first. */
  pos: number;
  /** The levels above it (1 to depth - 1) whose line runs on past it. */
  rails: number[];
  /** How many children its parent has. */
  size: number;
}

export interface FlatRow<T> {
  key: string;
  line: Line;
  node: T;
}

/**
 * A tree's rows in reading order, each with its place (`Line`): depth
 * first, every row followed by its children.
 */
export function flatTree<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  keyOf: (node: T) => string
): FlatRow<T>[] {
  const rows: FlatRow<T>[] = [];
  // Whether the line at each level runs on past the row being placed.
  const runsOn: boolean[] = [];
  const walk = (nodes: readonly T[], depth: number) => {
    nodes.forEach((node, at) => {
      const last = at === nodes.length - 1;
      const rails: number[] = [];
      for (let level = 1; level < depth; level += 1) {
        if (runsOn[level]) {
          rails.push(level);
        }
      }
      rows.push({
        key: keyOf(node),
        node,
        line: {
          depth,
          first: at === 0,
          last,
          pos: at + 1,
          rails,
          size: nodes.length,
        },
      });
      runsOn[depth] = !last;
      walk(childrenOf(node), depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

/** A row's attributes: its depth and place, for the lines and for a reader. */
export const lineAttrs = (line: Line) => ({
  "data-line-row": "",
  "data-line-depth": line.depth,
  "data-line-first": line.first && line.depth > 0 ? "" : undefined,
  "aria-level": line.depth + 1,
  "aria-posinset": line.pos,
  "aria-setsize": line.size,
});
