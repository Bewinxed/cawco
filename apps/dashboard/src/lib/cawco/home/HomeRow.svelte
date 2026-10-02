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
   * One session in a home group. It leads with the session's mark, the same
   * tile the rail draws for it, its rim saying what it is doing
   * (SessionMark); the status word is read out with the title, so colour is
   * never the only signal. Under the title, the project and what it is doing
   * now; at the end, the count of the rows under it and the age, each in a
   * column of its own so they line up down the list. Where it runs is said
   * once by the machine header above it, never per row; only a flat list
   * (Recent) names the machine.
   *
   * The row is the session menu's trigger (right-click, long-press, the menu
   * key), as every session row in the app is; a pointer can drag it onto a
   * pane's edge to split, or into a group's tabs. On a wide screen a click
   * opens it in the focused pane.
   *
   * A parent folds the rows under it (`fold`): their count, in its column
   * before the age, is what opens and folds them. A finished row can be archived
   * (`onarchive`): a pointer has a button left of Peek, a finger swipes the
   * row away, and both have it in the menu.
   */
  import type { NeutralSessionInfo } from "@cawco/core";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import { IconArchive, IconMaximize } from "$lib/icons";
  import { cn } from "$lib/utils";
  import type { InstanceRow } from "../client.svelte";
  import LiveSessionMenu from "../LiveSessionMenu.svelte";
  import SessionMark, {
    STATUS_WORD,
    sessionStatus,
  } from "../SessionMark.svelte";
  import StoredSessionMenu from "../StoredSessionMenu.svelte";
  import TreeCount from "../TreeCount.svelte";
  import { runIdOf } from "../workflow-runs";
  import { dragSession } from "../workspace/dnd.svelte";
  import { openPeek } from "./peek.svelte";
  import { swipeToArchive } from "./swipe-archive";

  let {
    instance = null,
    info = null,
    machineId,
    title,
    line = "",
    trail = "",
    href,
    active = false,
    stale = false,
    done = false,
    context = false,
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
    /** The rows under it, when it is a parent (tree.ts). */
    fold?: {
      count: number;
      failed: number;
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
  /** Where it runs, for its mark's hue: the same seed the rail uses. */
  const place = $derived(
    instance?.cwd || info?.cwd || instance?.machineId || machineId
  );
</script>

{#snippet body(trigger: Record<string, unknown>)}
  <div
    class="item"
    data-active={active || undefined}
    data-archivable={onarchive ? true : undefined}
    data-context={context || undefined}
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
      aria-current={active ? 'page' : undefined}
      class={cn('row press-tint focus-inset', trigger.class as string | undefined)}
      data-hover-session={instance?.id}
      data-rail-row
      data-share="session:{sessionId}"
      {href}
      use:dragSession={{
      sessionId,
      from: null,
      ctx: () =>
        info
          ? { machine: machineId, cwd: info.cwd ?? '', harness: info.harness ?? 'claude' }
          : null,
    }}
    >
      <SessionMark id={sessionId} {place} {status} />
      <!-- Two lines: the title ending in the age, then what it is doing
           ending in the count's column, a fixed width at the row's end, so
           every count in the list starts at one x and the title gives up
           only the age's own width. -->
      <span class="text">
        <span class="first">
          <span class="title"
            ><span class="sr-only">{STATUS_WORD[status]}: </span>{title}</span
          >
          <span class="num trail">{trail}</span>
        </span>
        <span class="second">
          <span class="line">{line}</span>
          <span class="kit-count-col">
            {#if fold}
              <TreeCount compact {...fold} />
            {/if}
          </span>
        </span>
      </span>
    </a>
    {#if onarchive}
      <Tip label="Archive">
        {#snippet children(tip)}
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
    {#if instance && !run}
      {@const live = instance}
      <!-- Glance → peek → dive: the tail of this one, without leaving home.
           A workflow run has no tail of its own: its card is its steps. -->
      <Tip label="Peek">
        {#snippet children(tip)}
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
    {#snippet children(trigger)}
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
  /* Hover and selection are the list's (highlight: the rail's one ghost,
     the list's own pill), so a row never paints a second one under them. */
  /* The peek sits at the row's end. A fine pointer finds it on hover or
     focus; a touch screen always shows it, since there is no hover. */
  .peek {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
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
  /* At a desk it takes no room until wanted: it rises over the row's end. */
  @media (hover: hover) and (pointer: fine) {
    .peek {
      position: absolute;
      right: var(--space-1);
      margin: 0;
      background: var(--surface-hover);
      opacity: 0;
    }
    .item[data-active] .peek {
      background: var(--selected-bg);
    }
    .item:hover .peek,
    .item:focus-within .peek {
      opacity: 1;
    }
    .peek:hover {
      background: var(--surface-fill);
      color: var(--ink-strong);
    }
    /* Archive rises beside Peek, left of it. */
    .archive {
      right: calc(var(--space-1) + 30px);
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
     of the commit point, they slide back. Up and down stays the list's. */
  .item[data-archivable] {
    touch-action: pan-y;
  }
  .row,
  .peek {
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
  .text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }
  /* Each line: its words, then the trailing column. */
  .first,
  .second {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }
  /* The second line stands at the count's height with or without one (a
     context row says nothing on it), so every row in a list is one height
     and the nesting lines meet each glyph alike. */
  .second {
    min-block-size: var(--space-5);
  }
  .title,
  .line {
    flex: 1 1 auto;
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
    flex: none;
    white-space: nowrap;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .item[data-active] {
    color: var(--selected-ink);
  }
  .item[data-active] .line,
  .item[data-active] .trail,
  .item[data-active] .peek {
    color: var(--selected-ink);
  }
  .item[data-context]:not([data-active]) .title {
    color: var(--ink-muted);
  }
  .item[data-stale] {
    opacity: 0.55;
  }
</style>
