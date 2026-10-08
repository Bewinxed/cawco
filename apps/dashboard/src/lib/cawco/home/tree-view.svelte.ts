/**
 * One home list's rows as the tree a reader sees: every list of sessions in
 * the home (Working, Finished, Recent) holds one of these and draws it with
 * SessionTree, so they nest, fold and open alike. It is given the list's
 * lines (tree.ts) and answers what each row's place is, what a parent folds
 * under its "N older" row (older.ts), and which lines are out.
 */
import type { Attachment } from "svelte/attachments";
import type { InstanceRow } from "../client.svelte";
import { DELEGATE_WINDOW, failedIn, listedOf, runningIds } from "../older";
import { openTrees, type TreeList } from "../open-trees.svelte";
import { collapse, type TreeLine } from "../tree";
import { clock, lastAt } from "./home-state.svelte";

type Line = TreeLine<InstanceRow>;

/** What a parent folds under its "N older" row (older.ts, OlderRows). */
export interface Older {
  /** The rows it holds, at every depth: the number the row says. */
  count: number;
  /** How many of them failed. */
  failed: number;
  /** Every row in it, at every depth. */
  held: Set<string>;
  /** The rows directly under the parent that fold. */
  tops: Set<string>;
}

export class TreeView {
  readonly #read: () => Line[];
  readonly #list: () => TreeList;

  constructor(lines: () => Line[], list: () => TreeList) {
    this.#read = lines;
    this.#list = list;
  }

  /** The list drawing it: whose open trees it reads (open-trees). */
  get list(): TreeList {
    return this.#list();
  }

  /** The list's rows in tree order (tree.ts). */
  readonly lines = $derived.by(() => this.#read());

  /** Every row's place in the tree: depth, last sibling, rails through it. */
  readonly #shapes = $derived(
    new Map(this.lines.map((line) => [line.row.id, line]))
  );

  readonly #running = $derived(runningIds());

  /**
   * Each parent's older rows, by the rule a project's sessions are split by:
   * a session lists its recent delegates and folds the rest. Rows that are
   * running never fold; a session's hundred ended delegates do.
   */
  readonly #olders = $derived.by(() => {
    const kids = new Map<string, Line[]>();
    for (const line of this.lines) {
      if (line.parent) {
        kids.set(line.parent, [...(kids.get(line.parent) ?? []), line]);
      }
    }
    const reading = { lastAt, now: clock.now, running: this.#running };
    const out = new Map<string, Older>();
    for (const [parent, lines] of kids) {
      const listedRows = listedOf(
        lines.map((line) => line.row),
        (row) => this.shapeOf(row.id)?.descendants ?? [],
        reading,
        DELEGATE_WINDOW
      );
      const older = lines.filter((line) => !listedRows.has(line.row.id));
      if (older.length === 0) {
        continue;
      }
      // A context line stands in for a row the list does not hold: it is
      // drawn, and counts for nothing, as on its parent's mark.
      const rows = older.flatMap((line) =>
        line.context ? line.descendants : [line.row, ...line.descendants]
      );
      out.set(parent, {
        count: rows.length,
        failed: failedIn(rows),
        held: new Set([
          ...older.map((line) => line.row.id),
          ...rows.map((row) => row.id),
        ]),
        tops: new Set(older.map((line) => line.row.id)),
      });
    }
    return out;
  });

  /** Every tree folded until opened, older rows and all. */
  readonly #opened = $derived(
    collapse(this.lines, (id) => openTrees.has(id, this.list))
  );

  /**
   * The lines as the reader sees them listed: the rows a parent folds under
   * its "N older" row are not lines of the list. They are drawn in that
   * row's own box (`boxed`).
   */
  readonly folded = $derived.by(() => {
    const out: Line[] = [];
    let foldedBelow = Number.POSITIVE_INFINITY;
    for (const line of this.#opened) {
      if (line.depth > foldedBelow) {
        continue;
      }
      foldedBelow = Number.POSITIVE_INFINITY;
      if (line.parent && this.olderOf(line.parent)?.tops.has(line.row.id)) {
        foldedBelow = line.depth;
        continue;
      }
      out.push(line);
    }
    return out;
  });

  /** Every row the list draws, the rows in an older box too. */
  readonly boxed = $derived(this.#opened.map((line) => line.row));

  shapeOf = (id: string): Line | undefined => this.#shapes.get(id);

  olderOf = (id: string): Older | undefined => this.#olders.get(id);

  /** The rows of `rows` that hang directly under `parent` (null: the tops). */
  under = (rows: InstanceRow[], parent: string | null): InstanceRow[] =>
    rows.filter((row) => (this.shapeOf(row.id)?.parent ?? null) === parent);

  /**
   * The tree's keys, for the box a list draws its trees in: → opens the
   * tree of the row with focus, ← folds it; ← on a row that is not open
   * goes up to its parent, the way a tree view walks. A row is found by
   * its line (SessionTree `data-key`), so a row of the list that is no
   * session of this tree takes neither key.
   */
  keys: Attachment<HTMLElement> = (box) => {
    const onkey = (event: KeyboardEvent): void => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      const id = (event.target as Element).closest<HTMLElement>("[data-key]")
        ?.dataset.key;
      const line = id ? this.shapeOf(id) : undefined;
      if (!(id && line)) {
        return;
      }
      const parent = line.descendants.length > 0;
      const open = event.key === "ArrowRight";
      if (parent && openTrees.has(id, this.list) !== open) {
        event.preventDefault();
        openTrees.set(id, open, this.list);
      } else if (!open && line.parent) {
        event.preventDefault();
        box
          .querySelector<HTMLElement>(
            `[data-key="${CSS.escape(line.parent)}"] [data-rail-row]`
          )
          ?.focus();
      }
    };
    box.addEventListener("keydown", onkey);
    return () => box.removeEventListener("keydown", onkey);
  };

  /** A parent's folded rows, for its row's count; null otherwise. */
  foldOf = (
    id: string
  ): { count: number; open: boolean; ontoggle: () => void } | null => {
    const line = this.shapeOf(id);
    if (!line?.descendants.length) {
      return null;
    }
    return {
      count: line.descendants.length,
      open: openTrees.has(id, this.list),
      ontoggle: () => openTrees.toggle(id, this.list),
    };
  };
}
