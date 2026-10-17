<script lang="ts" module>
  import { olderOpen, type TreeList } from "./open-trees.svelte";

  /**
   * Whether a parent's older rows are out: opened by hand, or because the
   * conversation in front is one of them (`front`), in that list. A list
   * that leaves the rows of a shut box out of what it lists asks the same
   * question.
   */
  export const olderOut = (
    id: string,
    front: boolean,
    list: TreeList
  ): boolean => front || olderOpen[list].has(id);
</script>

<script generics="T" lang="ts">
  /**
   * A parent's older rows (older.ts): the "N older" row, the last row under
   * the parent and on the same nesting line as its siblings, and under it,
   * when opened, a box OLDER_ROWS rows tall the older trees scroll in, so
   * opening them never pushes what is below far down the rail. One component
   * for every parent that folds rows: a project's older sessions, a
   * session's older delegates and a delegate's own, in the rail and in the
   * home.
   *
   * The row is a disclosure, so a button. Its lead is a tree mark on its
   * siblings' axis (where the parent's arm ends), with the history glyph as
   * its face and no tile under it; the row is the switch. The box opens and
   * folds as every tree does (motion/branch), and draws no line: it scrolls
   * on its own, off the parent's rail, which ends at the row that opens it.
   *
   * The press shows at once: the row is busy and its glyph gives way to the
   * spinner in the frame of the press, and the rows are drawn on the frame
   * after that one is painted, so the press never waits on them. Only what
   * the box shows is drawn then (a project with 275 older rows drew every
   * one in the press's own task); the rest follow a frame at a time once the
   * tree around the box has landed. A press while it is busy or open takes
   * it back, whatever was under way.
   */
  import { type Snippet, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconHistory } from "#lib/icons.js";
  import { type BranchOptions, branch } from "./motion/branch.svelte";
  import { failedWords, OLDER_ROWS } from "./older";
  import TreeMark from "./TreeMark.svelte";

  let {
    id,
    list,
    trees = [],
    count,
    failed = 0,
    keyOf,
    tree,
    front = false,
    tall = false,
    flip = true,
    still = false,
    motion,
  }: {
    /** The parent whose older rows these are: a project's id, a session's. */
    id: string;
    /** The list drawing it: whose open boxes it reads, and its box's scroll. */
    list: TreeList;
    /** The older trees, in the list's order; none while they are not out. */
    trees?: T[];
    /** The rows it holds, at every depth: the number the row says. */
    count: number;
    /** How many of those rows failed (older.ts `failedIn`). */
    failed?: number;
    keyOf?: (held: T) => string;
    /** One older tree, drawn as the list draws its rows. */
    tree?: Snippet<[T]>;
    /** The conversation in front is one of them: the box is out, on it. */
    front?: boolean;
    /** Among two-line rows (the home's): the row stands at their height. */
    tall?: boolean;
    /** Its box is reflow's to move (motion/rows); not while a list drives it. */
    flip?: boolean;
    /** A copy on its way out of a list: the row alone, taking no press. */
    still?: boolean;
    /** The row's own motion, as an `animation` value, where the list gives its rows one. */
    motion?: string;
  } = $props();

  /** How the box opens and folds: off each row's mark, as every tree. */
  const TREE: BranchOptions = { glyph: '[data-slot="tree-mark"]' };
  /** Older trees drawn a frame once the box's first rows stand. */
  const STEP = 24;
  /** One row's height, for the row and the box that shows six of them. */
  const height = $derived(
    tall
      ? "calc(2 * var(--space-5) + 2 * var(--space-1))"
      : "var(--row-compact-h)"
  );

  /** Asked for and not yet drawn. */
  let pending = $state(false);
  /** How many of the older trees are drawn so far. */
  let drawn = $state(OLDER_ROWS);
  let frame = 0;
  let box = $state<HTMLElement>();

  const out = $derived(!still && olderOut(id, front, list));

  function toggle(): void {
    cancelAnimationFrame(frame);
    const opened = olderOpen[list];
    if (opened.has(id) || pending) {
      opened.delete(id);
      pending = false;
      return;
    }
    pending = true;
    // The first frame paints the busy row; the rows are drawn on the next.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        opened.add(id);
        pending = false;
      });
    });
  }
  $effect(() => () => cancelAnimationFrame(frame));

  /**
   * The box starts on what it shows, and takes the rest a frame at a time
   * once nothing around it is opening: drawn while a tree opened (its own
   * box, or the parent's tree it stands in), they were measured into that
   * tree's line, which then ran the length of every row and landed seconds
   * late. With the conversation in front among them, every row is drawn at
   * once, so it can be scrolled to.
   */
  const fill: Attachment<HTMLElement> = (node) => {
    // Read once, as the box mounts: a row moving in the list is no reason
    // to start it over.
    drawn = untrack(() => (front ? trees.length : OLDER_ROWS));
    let next = requestAnimationFrame(function step() {
      if (drawn >= trees.length) {
        return;
      }
      if (!node.closest("[data-branch-hold], [data-branch-draw]")) {
        drawn += STEP;
      }
      next = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(next);
  };

  // The conversation in front stays in view inside its box.
  $effect(() => {
    if (!(front && box)) {
      return;
    }
    const within = box;
    const scroll = requestAnimationFrame(() => {
      within
        .querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(scroll);
  });

  /** Marks which edges of the box have more past them, for the fade. */
  const scrollEdges: Attachment<HTMLElement> = (node) => {
    const mark = () => {
      node.toggleAttribute("data-more-above", node.scrollTop > 0);
      node.toggleAttribute(
        "data-more-below",
        node.scrollTop + node.clientHeight < node.scrollHeight - 1
      );
    };
    mark();
    const sizes = new ResizeObserver(mark);
    sizes.observe(node);
    // Rows that arrive after the box opened (`fill`) leave its own size as
    // it was: only its content grew.
    const rows = new MutationObserver(mark);
    rows.observe(node, { childList: true });
    node.addEventListener("scroll", mark, { passive: true });
    return () => {
      sizes.disconnect();
      rows.disconnect();
      node.removeEventListener("scroll", mark);
    };
  };
</script>

<!-- The row's box (`data-flip="box"`): its older rows open in it, so it
     takes their room at once and what is under it slides with its edge
     (motion/rows), as a session's delegates do. -->
<Sidebar.MenuSubItem
  data-flip={flip && !still ? "box" : undefined}
  style="--older-h:{height}"
>
  <!-- The row's measures: the compact session row's own in a tree in the
       rail, a two-line row's among the home's (`data-tall`), so its lead and
       its words stand on its siblings' axes and the nesting line meets its
       mark as it meets theirs. -->
  <Sidebar.MenuSubButton
    class="h-(--older-h) gap-(--row-compact-gap) pl-(--row-compact-gap) pr-(--row-compact-pad-end) data-tall:gap-space-2 data-tall:pl-space-3 data-tall:pr-space-3 text-ink-muted"
    data-branch-item
    data-tall={tall || undefined}
  >
    {#snippet child({ props })}
      <!-- Busy from the press until its rows are drawn: the glyph gives way
           to the kit's spinner, as a pending Button's icon does. -->
      <button
        {...props}
        class={[props.class, "mark-line", motion && "animate-(--swap-anim)"]}
        aria-busy={pending || undefined}
        aria-expanded={out}
        onclick={toggle}
        style:--swap-anim={motion}
        type="button"
      >
        <TreeMark
          open={out}
          rowToggles
          status={failed > 0 ? "fail" : undefined}
        >
          {#snippet face()}
            <!-- The glyph and the spinner stacked in one cell (the kit's
                 icon swap, at a control's pace). Out of the button's name:
                 `aria-busy` says it, and a status in here was read into the
                 name at rest. -->
            <span class="icon-swap" style:--icon-swap-dur="var(--dur-control)">
              <span data-active={!pending}
                ><IconHistory class="size-icon-md" /></span
              >
              <span data-active={pending}
                ><Spinner class="size-icon-sm" role="presentation" /></span
              >
            </span>
          {/snippet}
        </TreeMark>
        <span data-slot="num" class="num"
          ><span
            class="inline-grid w-(--digits-w)"
            style:--digits-w="{String(count).length}ch"
            ><MorphText text={String(count)} /></span
          >
          older</span
        >
        {#if failed > 0}
          <!-- literal: 0.3em -->
          <span
            class="ms-(--failed-gap) text-status-fail-ink"
            style:--failed-gap="0.3em">{failedWords(failed)}</span
          >
        {/if}
      </button>
    {/snippet}
  </Sidebar.MenuSubButton>
  {#if out}
    <!-- reflow never copies or uncovers what is inside (`data-flip-anchor`).
         Six rows at most, scrolling in place. The edges fade only while
         there is more past them: a mask on each edge (scrollEdges sets the
         attributes). -->
    <ul
      data-slot="older-rows-box"
      class="flex flex-col gap-(--gap) max-h-(--older-max) mt-(--tree-gap) mx-0 mb-0 p-0 overflow-y-auto overscroll-contain scrollbar-thin list-none data-more-above:mask-(--fade-above) data-more-below:mask-(--fade-below) data-more-above:data-more-below:mask-(--fade-both)"
      data-flip-anchor
      style:--fade="var(--space-4)"
      style:--fade-above={"linear-gradient(transparent, var(--mask-opaque) var(--fade))"}
      style:--fade-below={"linear-gradient(var(--mask-opaque) calc(100% - var(--fade)), transparent)"}
      style:--fade-both={"linear-gradient(transparent, var(--mask-opaque) var(--fade), var(--mask-opaque) calc(100% - var(--fade)), transparent)"}
      style:--gap="calc(var(--tree-gap) / 2)"
      style:--older-max="calc(6 * var(--older-h) + 5 * var(--gap))"
      data-keep-scroll="{list}:{id}"
      bind:this={box}
      in:branch={TREE}
      out:branch={TREE}
      {@attach scrollEdges}
      {@attach fill}
    >
      {#each trees.slice(0, drawn) as held (keyOf?.(held))}
        {@render tree?.(held)}
      {/each}
    </ul>
  {/if}
</Sidebar.MenuSubItem>
