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

  /**
   * One size observer for every row's trailing column: each writes its
   * width on its row as `--trail-w` (`trailWidth`).
   */
  let trailSizes: ResizeObserver | undefined;
  const watchTrail = (node: HTMLElement): (() => void) => {
    trailSizes ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        const [box] = entry.borderBoxSize;
        entry.target
          .closest<HTMLElement>(".item")
          ?.style.setProperty("--trail-w", `${box.inlineSize}px`);
      }
    });
    trailSizes.observe(node);
    return () => trailSizes?.unobserve(node);
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
   * for a live session, in the wide layout only (a desk and an iPad; a
   * phone has none). A finished row can be archived (`onarchive`): a
   * pointer has a button left of Peek, a finger swipes the row away, and
   * both have it in the menu.
   *
   * At rest nothing here is a stacking context (no transform, filter or
   * opacity on the link): a parent's mark stands over the rows folding
   * under it only while that holds (app.css, by the group under the row).
   */
  import type { NeutralSessionInfo } from "@cawco/core";
  import type { Attachment } from "svelte/attachments";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconArchive, IconMaximize } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { page } from "$app/state";
  import AskHere from "./AskHere.svelte";
  import { shownAccount } from "./accounts/switch.svelte";
  import { STOPPING_LABEL } from "./activity";
  import { Asker, type AskHereRequest } from "./ask-here.svelte";
  import type { InstanceRow } from "./client.svelte";
  import { openPeek, peekable, peekTipOff } from "./home/peek.svelte";
  import { swipeToArchive } from "./home/swipe-archive";
  import LiveSessionMenu from "./LiveSessionMenu.svelte";
  import { unfold } from "./motion/fold.svelte";
  import RowFault from "./RowFault.svelte";
  import SessionMark from "./SessionMark.svelte";
  import StoredSessionMenu from "./StoredSessionMenu.svelte";
  import {
    noteOn,
    type RenameTarget,
    renameSession,
    sessionAct,
  } from "./session-acts.svelte";
  import { cawOf, sessionStatus, statusWord } from "./session-status";
  import { isThreadTab } from "./thread-tabs";
  import AccountDot from "./usage/AccountDot.svelte";
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
  /** The row is a thread with the project's Caw (thread-tabs.ts), not a session. */
  const thread = $derived(instance ? isThreadTab(instance.id) : false);
  const status = $derived(sessionStatus(instance, done));
  /** Where it runs, for its mark's hue: the same seed in every list. */
  const place = $derived(
    instance?.cwd || info?.cwd || instance?.machineId || machineId
  );
  /**
   * Peek rises at the row's end: a live session's, not a workflow run's or
   * a thread's (a thread is opened: it is the conversation itself), and
   * only in the wide layout (peek.svelte.ts).
   */
  const peeks = $derived(peek && instance !== null && !run && !thread);
  const showPeek = $derived(peeks && peekable());
  /**
   * The trailing column's width (the wider of the age and the count), on its
   * row as `--trail-w`: what rises over the row's end on hover (Peek,
   * Archive) stands left of it, so a row with neither is not measured: a
   * tree in the rail wrote the width on every row it drew, and each write
   * restyled its row. Written from a size observer, after layout: read
   * where the row renders (`bind:offsetWidth`), it laid the page out in the
   * middle of the update that opened a tree, once a row.
   */
  const trailWidth: Attachment<HTMLElement> | undefined = $derived(
    showPeek || onarchive ? watchTrail : undefined
  );

  /** What was asked of this session and is on its way, or did not go (session-acts). */
  const act = $derived(sessionId ? sessionAct(sessionId) : undefined);
  /**
   * The word for what is on its way: what this person asked and is waiting
   * on (session-acts), or a stop the hub holds until the machine confirms it
   * (`stopping`, whoever asked it, from whichever client).
   */
  const pending = $derived(
    act?.pending ??
      (instance?.status === "stopping" ? STOPPING_LABEL : undefined)
  );

  /**
   * What its menu asks before a delete, said under this row, the one it was
   * asked from (AskHere): another list drawing the same session doesn't ask
   * it too. A row that leaves the list takes its question with it.
   */
  const asks = new Asker<AskHereRequest>();
  $effect(() => () => asks.dismiss());

  /**
   * Renaming edits the name where it stands: the title becomes a field in
   * this row, holding the name. Enter (or leaving it changed) sends it; the
   * field stays, pending, until the row is named by it (the hub's frame, or
   * the machine's catalog), and Escape puts the name back. A refusal leaves
   * the field with what was typed and the reason under the row.
   */
  let draft = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameFault = $state<string | null>(null);
  const renameTarget = $derived.by((): RenameTarget | null => {
    if (instance) {
      return { instanceId: instance.id };
    }
    return info ? { info, machineId } : null;
  });

  function editTitle(): void {
    draft = title;
    renameFault = null;
  }

  function stopEditing(): void {
    draft = null;
    renaming = null;
    renameFault = null;
  }

  async function commitTitle(): Promise<void> {
    const next = draft?.trim() ?? "";
    if (renaming !== null || !renameTarget) {
      return;
    }
    if (!next || next === title) {
      stopEditing();
      return;
    }
    renaming = next;
    renameFault = null;
    try {
      await renameSession(renameTarget, next);
    } catch (error) {
      renaming = null;
      renameFault = failureWords(error);
    }
  }

  // The new session a continuation started is open now: the note has done
  // its work.
  $effect(() => {
    if (act?.note && page.url.pathname === act.note.href) {
      noteOn(sessionId, undefined);
    }
  });

  // Named: the field gives way to the name it sent.
  $effect.pre(() => {
    if (renaming !== null && title === renaming) {
      stopEditing();
    }
  });
</script>

{#snippet inner()}
  <!-- On a parent, its mark says how many rows are under it and opens
       them. -->
  <SessionMark
    caw={cawOf(sessionId)}
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
  <!-- Each line's words stand on the middle of their cell (app.css, the mark
       line), the line the mark centres on. -->
  <span data-slot="words" class="words mark-line">
    {#if draft !== null}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        data-slot="title"
        data-field
        aria-label="Session title"
        autocomplete="off"
        autofocus
        class="cell title field focus-inset"
        data-box
        onblur={() => {
          // Left after a refusal, it stays as typed, said under the row; Try
          // again or Enter sends it.
          if (renameFault === null) {
            commitTitle();
          }
        }}
        onkeydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            stopEditing();
          }
        }}
        readonly={renaming !== null}
        spellcheck="false"
        bind:value={draft}
        {@attach (node) => node.select()}
      />
    {:else}
      <span data-slot="title" class="cell title"
        ><span class="sr-only"
          >{pending ?? statusWord(instance, status)}:
        </span>
        {title}</span
      >
    {/if}
    {#if !compact}
      <!-- mark-line: a line of text, trimmed by .words; the account dot stands
           in it on vertical-align: middle, the x-height's middle -->
      <span class="cell line">
        {#if pending || renaming !== null}
          <span data-slot="doing" class="doing mark-line"
            ><Spinner aria-hidden="true" />
            <span>{renaming === null ? pending : "Renaming…"}</span></span
          >
        {:else}
          <AccountDot
            accountId={instance ? shownAccount(instance) : undefined}
          />{line}
        {/if}
      </span>
    {/if}
  </span>
  <span data-slot="end" class="end" {@attach trailWidth}>
    <span
      data-slot="num"
      class="cell num trail mark-line"
      title={pending ?? hint}
    >
      {#if compact && (pending || renaming !== null)}
        <Spinner aria-hidden="true" class="size-space-4" />
      {:else}
        <span>{trail}</span>
      {/if}
    </span>
    {#if !compact}
      <span class="cell"></span>
    {/if}
  </span>
{/snippet}

{#snippet body(trigger: Record<string, unknown>)}
  <div
    data-slot="item"
    class="item"
    data-archivable={onarchive ? true : undefined}
    data-branch-item
    data-compact={compact || undefined}
    data-context={context || undefined}
    data-current={active || undefined}
    data-flip
    data-peek={showPeek || undefined}
    data-stale={stale || undefined}
    {@attach onarchive ? swipeToArchive(onarchive) : undefined}
  >
    {#if onarchive}
      <!-- What a finger uncovers as it draws the row away. -->
      <span aria-hidden="true" class="swipe-reveal mark-line"
        ><IconArchive /><span>Archive</span></span
      >
    {/if}
    {#if draft !== null}
      <!-- Being renamed: the row is the field's form, not a link, until the
           name settles or Escape puts it back. -->
      <form
        data-slot="row"
        class="row"
        data-rail-row
        onsubmit={(event) => {
          event.preventDefault();
          commitTitle();
        }}
      >
        {@render inner()}
      </form>
    {:else}
      <a
        data-session-row-row
        {...trigger}
        aria-busy={pending ? true : undefined}
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
        {@render inner()}
      </a>
    {/if}
    {#if onarchive}
      <Tip label="Archive">
        {#snippet children(tip)}
          <button
            data-archive
            {...tip}
            aria-label="Archive {title}"
            class="row-action archive touch-hit focus-inset"
            onclick={onarchive}
            type="button"
          >
            <IconArchive aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    {/if}
    {#if showPeek && instance}
      {@const live = instance}
      <!-- Glance → peek → dive: the tail of this one, without leaving the
           list. A workflow run has no tail of its own: its card is its
           steps. -->
      <Tip disabled={peekTipOff()} label="Peek">
        {#snippet children(tip)}
          <button
            data-session-row-peek
            {...tip}
            aria-label="Peek {title}"
            class="row-action peek touch-hit focus-inset"
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

{#if run || thread}
  <!-- A workflow run, or a thread, takes no session commands; archive is on
       the row. -->
  {@render body({})}
{:else if instance}
  <LiveSessionMenu asker={asks} {instance} {onarchive} onrename={editTitle}>
    {#snippet children(trigger)}
      {@render body(trigger)}
    {/snippet}
  </LiveSessionMenu>
{:else if info}
  <StoredSessionMenu asker={asks} {info} {machineId} onrename={editTitle}>
    {@render body({})}
  </StoredSessionMenu>
{/if}
<!-- A delete's question, under the row it was asked from. -->
<AskHere
  asker={asks}
  at={sessionId}
  class="session-ask"
  data-compact={compact || undefined}
/>
<!-- What did not go, under the row that asked: a rename's reason here, any
     other action's on every row of this session (session-acts). -->
<RowFault
  again={commitTitle}
  class="session-fault"
  data-compact={compact || undefined}
  reason={renameFault}
/>
<RowFault
  again={act?.fault?.again}
  againLabel={act?.fault?.againLabel}
  class="session-fault"
  data-compact={compact || undefined}
  reason={act?.fault?.reason}
/>
{#if act?.note}
  <p class="session-note" data-compact={compact || undefined} transition:unfold>
    {act.note.text}
    <a href={act.note.href} onclick={() => noteOn(sessionId, undefined)}>Open</a
    >
  </p>
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
    /* And how far sideways under a finger: to the row's words. */
    --mark-hit-gap: var(--space-2);
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
      (var(--row-compact-h) - var(--mark-size, 18px)) / 2 + var(--tree-gap)
    );
    --mark-hit-gap: var(--row-compact-gap);
    padding: 0 var(--row-compact-pad-end) 0 var(--row-compact-gap);
  }
  /* Hover and selection are the list's (highlight: the rail's one ghost,
     the list's own pill), so a row never paints a second one under them. */
  /* Peek and Archive sit at the row's end. A fine pointer finds them on
     hover or focus; a touch screen always shows Peek, since there is no
     hover, and swipes instead of Archive. */
  .row-action {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--action-size);
    height: var(--action-size);
    margin-right: var(--space-2);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .row-action :global(svg) {
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
    --action-size: 28px;
    --action-end: calc(var(--space-3) + var(--trail-w, 0px) + var(--space-1));
  }
  @media (hover: hover) and (pointer: fine) {
    .row-action {
      position: absolute;
      inset-block: 0;
      right: var(--action-end);
      margin: auto 0;
      background: var(--surface-hover);
      opacity: 0;
    }
    .item[data-current] .row-action {
      background: var(--selected-bg);
    }
    .item:hover .row-action,
    .item:focus-within .row-action {
      opacity: 1;
    }
    /* Archive rises beside Peek, a step left of it. */
    .item[data-peek] .archive {
      right: calc(var(--action-end) + var(--action-size) + var(--space-1));
    }
    /* The words yield the buttons' room while they show, so the title never
       runs under them; a row with neither reserves nothing. */
    .item:is([data-archivable], [data-peek]):is(:hover, :focus-within) .words {
      margin-inline-end: calc(var(--action-size) + var(--space-1));
    }
    .item[data-archivable][data-peek]:is(:hover, :focus-within) .words {
      margin-inline-end: calc(2 * (var(--action-size) + var(--space-1)));
    }
    /* They stand on the row's ghost, by day the hover step itself: their own
       hover is the step past it. */
    .row-action:hover {
      background: light-dark(var(--surface-fill-strong), var(--surface-fill));
      color: var(--ink-strong);
    }
  }
  /* A finger swipes the row away instead: no button for it. Peek stays,
     always shown, in the row's flow at its end, with the house's 44px of
     touch area (`touch-hit`). */
  @media not ((hover: hover) and (pointer: fine)) {
    .archive {
      display: none;
    }
  }
  /* Under a finger Peek's glyph is the house's touch size (`icon-lg`, the
     bar's symbols), in the muted ink the row's always-shown words and
     actions use: at 16px its duotone read faint at arm's length. */
  @media (pointer: coarse) {
    .peek :global(svg) {
      width: var(--icon-lg);
      height: var(--icon-lg);
    }
  }
  /* A phone has no peek: the button is never drawn there (peek.svelte.ts),
     and this holds before the page is live. */
  @media (max-width: 899px) {
    .peek {
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
  .item[data-swiping] :is(.row, .row-action) {
    translate: calc(var(--swipe, 0px) * -1) 0;
  }
  .item:not([data-swiping]) :is(.row, .row-action) {
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
    overflow: clip;
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
  .item[data-current] .row-action {
    color: var(--selected-ink);
  }
  .item[data-context]:not([data-current]) .title {
    color: var(--ink-muted);
  }
  .item[data-stale] {
    opacity: 0.55;
  }
  /* The title as a field, in the title's own type and place: no box of its
     own beyond the input recipe's hairline, so the row keeps its height. */
  .field {
    inline-size: 100%;
    margin-inline: calc(var(--space-1) * -1);
    padding-inline: var(--space-1);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    color: var(--ink-strong);
  }
  .field[readonly] {
    color: var(--ink-muted);
  }
  /* What is on its way, in the meta line's place: the spinner, then the word. */
  .doing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  /* A row's fault, note and question start where its title does: past the
     row's own padding, its mark and the gap after it. */
  :global(.session-fault),
  :global(.session-ask),
  .session-note {
    --fault-indent: calc(var(--space-3) + 18px + var(--space-2));
    --fault-end: var(--space-3);
  }
  :global(.session-fault[data-compact]),
  :global(.session-ask[data-compact]),
  .session-note[data-compact] {
    --fault-indent: calc(var(--row-compact-gap) * 2 + var(--mark-size, 18px));
    --fault-end: var(--row-compact-pad-end);
  }
  :global(.session-ask) {
    --ask-indent: var(--fault-indent);
    --ask-end: var(--fault-end);
  }
  .session-note {
    margin: 0;
    padding-block: var(--space-1);
    padding-inline: var(--fault-indent) var(--fault-end);
    font: var(--type-meta);
    color: var(--ink-muted);
    & a {
      color: var(--ink-strong);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
</style>
