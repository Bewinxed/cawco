<script lang="ts" module>
  /**
   * The selection pill for a list of these rows (highlight): it sits under
   * the open session's row. Hover is the rail's one ghost, not the list's.
   */
  export const ROW_PILL = {
    rows: "[data-rail-row]",
    selected: '[aria-current="page"]',
    ghost: false,
  };
</script>

<script lang="ts">
  /**
   * One session, as every list that names sessions draws it: the rail's
   * project tree (a project's sessions, their delegates, its older ones),
   * the home's Working and Finished, Recent, and the drawer, which is the
   * home. It leads with the session's mark (SessionMark, a TreeMark), its
   * echo or dot saying what it is doing; the status word is read out with
   * the title, so colour is never the only signal. A list owns its
   * container, its order and how its rows nest; it owns nothing inside a
   * row.
   *
   * Two sizes of one row. In a home list it stands on two lines: the title,
   * and under it the project and what it is doing now; at the end the age,
   * on the title's line. Under a project in the rail it is `compact`: one
   * line, where the name has the least room, its age in a column as wide as
   * the longest ("59m") so the ages line up down the tree.
   *
   * The row is the session menu's trigger (right-click, long-press, the menu
   * key); a pointer can drag it onto a pane's edge to split, or into a
   * group's tabs. A click opens it in the focused pane, and the press tints
   * it (`.press-tint`).
   *
   * A parent folds the rows under it (`fold`): its mark says their count
   * and is the switch (motion/branch). Peek (`peek`) rises at the row's end
   * for a live session. A finished row can be archived (`onarchive`): a
   * pointer has a button left of Peek, a finger swipes the row away, and
   * both have it in the menu.
   *
   * At rest nothing here is a stacking context (no transform, filter or
   * opacity on the link): a parent's mark stands over the rows folding
   * under it only while that holds (app.css, by the group under the row).
   */
  import type { NeutralSessionInfo } from "@cawco/core";
  import type { Attachment } from "svelte/attachments";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconArchive, IconMaximize } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import type { InstanceRow } from "./client.svelte";
  import { openPeek } from "./home/peek.svelte";
  import { swipeToArchive } from "./home/swipe-archive";
  import LiveSessionMenu from "./LiveSessionMenu.svelte";
  import SessionMark, {
    STATUS_WORD,
    sessionStatus,
  } from "./SessionMark.svelte";
  import StoredSessionMenu from "./StoredSessionMenu.svelte";
  import { runIdOf } from "./workflow-runs";
  import { dragSession } from "./workspace/dnd.svelte";

  let {
    instance = null,
    info = null,
    machineId,
    title,
    line = "",
    trail = "",
    hint,
    href,
    active = false,
    stale = false,
    done = false,
    context = false,
    compact = false,
    peek = true,
    fold = null,
    onarchive,
  }: {
    instance?: InstanceRow | null;
    info?: NeutralSessionInfo | null;
    machineId: string;
    title: string;
    /** The meta line under the title: the project, then what adds to it. */
    line?: string;
    /** The time at the row's end. */
    trail?: string;
    /** The time in a sentence, for the pointer that rests on it. */
    hint?: string;
    href: string;
    /** It is the conversation in front. */
    active?: boolean;
    /** The hub is not live: the row is what was last known. */
    stale?: boolean;
    /** It is listed as finished: an idle session here is done, not idle. */
    done?: boolean;
    /**
     * Not one of the list's own: the parent of delegates that are, drawn so
     * they hang off it. Its title reads in muted ink.
     */
    context?: boolean;
    /** One line, for a tree in the rail: no meta line, the age in a column. */
    compact?: boolean;
    /** A live session offers Peek at the row's end. */
    peek?: boolean;
    /** The rows under it, when it is a parent (tree.ts). */
    fold?: {
      count: number;
      open: boolean;
      ontoggle: () => void;
    } | null;
    /** Takes it off the list without opening it (a finished row). */
    onarchive?: () => void;
  } = $props();

  const sessionId = $derived(instance?.id ?? info?.sessionId ?? "");
  /** The row is a workflow run (workflow-runs.ts), not a session. */
  const run = $derived(instance ? runIdOf(instance.id) !== null : false);
  const status = $derived(sessionStatus(instance, done));
  /** Where it runs, for its mark's hue: the same seed in every list. */
  const place = $derived(
    instance?.cwd || info?.cwd || instance?.machineId || machineId
  );
  /**
   * The trailing column's width (the wider of the age and the count), on its
   * row as `--trail-w`: what rises over the row's end on hover stands left
   * of it. Written from a size observer, after layout: read where the row
   * renders (`bind:offsetWidth`), it laid the page out in the middle of the
   * update that opened a tree, once a row.
   */
  const trailWidth: Attachment<HTMLElement> = (node) => {
    const item = node.closest<HTMLElement>(".item");
    const sizes = new ResizeObserver(([entry]) => {
      const [box] = entry.borderBoxSize;
      item?.style.setProperty("--trail-w", `${box.inlineSize}px`);
    });
    sizes.observe(node);
    return () => sizes.disconnect();
  };
</script>

{#snippet body(
  trigger: Record<string, unknown>
)}
  <div
    class="item"
    data-archivable={onarchive ? true : undefined}
    data-branch-item
    data-compact={compact || undefined}
    data-context={context || undefined}
    data-current={active || undefined}
    data-flip
    data-stale={stale || undefined}
    {@attach onarchive ? swipeToArchive(onarchive) : undefined}
  >
    {#if onarchive}
      <!-- What a finger uncovers as it draws the row away. -->
      <span aria-hidden="true" class="swipe-reveal"
        ><IconArchive />Archive</span
      >
    {/if}
    <a
      {...trigger}
      aria-current={active ? "page" : undefined}
      class={cn(
        "row press-tint focus-inset",
        trigger.class as string | undefined
      )}
      data-hover-session={instance?.id}
      data-rail-row
      data-share="session:{sessionId}"
      {href}
      use:dragSession={{
        sessionId,
        from: null,
        ctx: () =>
          info
            ? {
                machine: machineId,
                cwd: info.cwd ?? "",
                harness: info.harness ?? "claude",
              }
            : null,
      }}
    >
      <!-- On a parent, its mark says how many rows are under it and opens
           them. -->
      <SessionMark
        count={fold?.count ?? 0}
        id={sessionId}
        ontoggle={fold?.ontoggle}
        open={fold?.open ?? false}
        {place}
        {status}
      />
      <!-- The words (the title and, on two lines, what it is doing under
           it), and at the row's end the age, on the title's line, flush
           with the row's trailing edge. -->
      <span class="words">
        <span class="cell title"
          ><span class="sr-only">{STATUS_WORD[status]}: </span>{title}</span
        >
        {#if !compact}
          <span class="cell line">{line}</span>
        {/if}
      </span>
      <span class="end" {@attach trailWidth}>
        <span class="cell num trail" title={hint}>{trail}</span>
        {#if !compact}
          <span class="cell"></span>
        {/if}
      </span>
    </a>
    {#if onarchive}
      <Tip label="Archive">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-label="Archive {title}"
            class="peek archive touch-hit focus-inset"
            onclick={onarchive}
            type="button"
          >
            <IconArchive aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    {/if}
    {#if peek && instance && !run}
      {@const live = instance}
      <!-- Glance → peek → dive: the tail of this one, without leaving the
           list. A workflow run has no tail of its own: its card is its
           steps. -->
      <Tip label="Peek">
        {#snippet children(
          tip
        )}
          <button
            {...tip}
            aria-label="Peek {title}"
            class="peek touch-hit focus-inset"
            onclick={() => openPeek({ viewId: live.id, href, title })}
            type="button"
          >
            <IconMaximize aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    {/if}
  </div>
{/snippet}

{#if run}
  <!-- A workflow run takes no session commands; archive is on the row. -->
  {@render body({})}
{:else if instance}
  <LiveSessionMenu {instance} {onarchive}>
    {#snippet children(
      trigger
    )}
      {@render body(trigger)}
    {/snippet}
  </LiveSessionMenu>
{:else if info}
  <StoredSessionMenu {info} {machineId}> {@render body({})} </StoredSessionMenu>
{/if}

<style>
  .item {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    transition: var(--transition-control);
  }
  .row {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    /* Compact at a desk; a finger keeps its 44px. */
    min-height: var(--space-8);
    /* How far under its mark the mark's switch may reach: the room a
       two-line row leaves under it (44px less the 18px mark, halved), and
       the gap to the next row. */
    --mark-hit-max: calc(13px + var(--tree-gap));
    padding: var(--space-1) var(--space-3);
    border-radius: inherit;
    color: inherit;
    text-decoration: none;
  }
  @media (pointer: coarse) {
    .row {
      min-height: 44px;
    }
  }
  /* One line, in a tree in the rail: the gaps between its three parts
     (mark, name, age) are the tight ones, wide enough that the mark's
     status dot (3px out of the tile) clears the name. Its mark's switch
     reaches as far under it as the row leaves room. */
  .item[data-compact] .row {
    gap: var(--row-compact-gap);
    min-height: var(--row-compact-h);
    --mark-hit-max: calc(
      (var(--row-compact-h) - var(--mark-size, 18px)) /
      2 +
      var(--tree-gap)
    );
    padding: 0 var(--row-compact-pad-end) 0 var(--row-compact-gap);
  }
  /* Hover and selection are the list's (highlight: the rail's one ghost,
     the list's own pill), so a row never paints a second one under them. */
  /* The peek sits at the row's end. A fine pointer finds it on hover or
     focus; a touch screen always shows it, since there is no hover. */
  .peek {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--peek-size);
    height: var(--peek-size);
    margin-right: var(--space-2);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .peek :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* At a desk they take no room until wanted: they rise over the row's
     words, block-centred on the row, a step left of the trailing column
     (the row's end padding, then the column's measured width), so neither
     the age nor the count is ever under them. The row's corner is
     --radius-sm; they stand further in from its edges than that, so they
     keep the small control's own radius. */
  .item {
    --peek-size: 28px;
    --peek-end: calc(var(--space-3) + var(--trail-w, 0px) + var(--space-1));
  }
  @media (hover: hover) and (pointer: fine) {
    .peek {
      position: absolute;
      inset-block: 0;
      right: var(--peek-end);
      margin: auto 0;
      background: var(--surface-hover);
      opacity: 0;
    }
    .item[data-current] .peek {
      background: var(--selected-bg);
    }
    .item:hover .peek,
    .item:focus-within .peek {
      opacity: 1;
    }
    /* They stand on the row's ghost, by day the hover step itself: their own
       hover is the step past it. */
    .peek:hover {
      background: light-dark(var(--surface-fill-strong), var(--surface-fill));
      color: var(--ink-strong);
    }
    /* Archive rises beside Peek, a step left of it. */
    .archive {
      right: calc(var(--peek-end) + var(--peek-size) + var(--space-1));
    }
  }
  /* A finger swipes the row away instead: no button for it. */
  @media not ((hover: hover) and (pointer: fine)) {
    .archive {
      display: none;
    }
  }
  /* A finger drawing the row left: the row and its Peek follow it, and
     "Archive" is uncovered behind them, as wide as the drag. Let go short
     of the commit point, they slide back. Up and down stays the list's.
     Moved only while a finger is on it: a `translate` at rest, even of
     nothing, made the row a stacking context, and its mark's level over
     the rows folding under it (app.css, motion/branch) counted for nothing
     outside the row: its delegates' icons rode back over its tile. */
  .item[data-archivable] {
    touch-action: pan-y;
  }
  .item[data-swiping] :is(.row, .peek) {
    translate: calc(var(--swipe, 0px) * -1) 0;
  }
  .item:not([data-swiping]) :is(.row, .peek) {
    transition:
      var(--transition-control),
      translate var(--dur-exit) var(--ease-out);
  }
  .swipe-reveal {
    position: absolute;
    inset: 0 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    inline-size: var(--swipe, 0px);
    overflow: hidden;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: var(--selected-bg);
    color: var(--selected-ink);
    font: var(--type-meta);
    white-space: nowrap;
    pointer-events: none;

    & :global(svg) {
      flex: none;
      inline-size: 16px;
      block-size: 16px;
    }
  }
  /* The words take the room; the trailing column is as wide as the wider
     of its two cells and never yields. */
  .words,
  .end {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .words {
    flex: 1 1 auto;
  }
  .end {
    flex: none;
    align-items: flex-end;
    /* The row's gap is a mark's; words and what trails them sit closer. */
    margin-inline-start: calc(var(--space-1) - var(--space-2));
  }
  /* Both lines stand at the count's height with or without one (a context
     row says nothing on its second), so every row in a list is one height
     and the nesting lines meet each glyph alike. */
  .cell {
    display: flex;
    align-items: center;
    min-block-size: var(--space-5);
  }
  .title,
  .line {
    display: block;
    align-content: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font: var(--type-label);
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The age, at the title line's end: only as wide as it is, so the title
     keeps the rest; its right edge is the row's, the same down the list. */
  .trail {
    white-space: nowrap;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  /* In a tree the ages stand in one column, as wide as the longest
     ("59m"), right aligned, the row's own gap from the name. */
  .item[data-compact] {
    & .end {
      margin-inline-start: 0;
    }
    & .trail {
      justify-content: flex-end;
      inline-size: 3ch;
    }
  }
  .item[data-current] {
    color: var(--selected-ink);
  }
  .item[data-current] .line,
  .item[data-current] .trail,
  .item[data-current] .peek {
    color: var(--selected-ink);
  }
  .item[data-context]:not([data-current]) .title {
    color: var(--ink-muted);
  }
  .item[data-stale] {
    opacity: 0.55;
  }
</style>
