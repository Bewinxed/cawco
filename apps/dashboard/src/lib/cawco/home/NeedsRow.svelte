<script lang="ts">
  /**
   * A Needs you row's face (NeedsCard draws it for every kind but the
   * relay's journey): the row's box on the panel's one grid, the cover that
   * opens it, the lead (the session's mark, a run's or a budget's glyph),
   * the title and its wait, and what it wants in the words it is asked;
   * what stands under that (where it is from, its peers, its call) is the
   * owner's, as `below`. Everything it says arrives as props, so the row
   * mounts without the fleet's store; NeedsCard reads the store and fills it.
   */
  import type { Snippet } from "svelte";

  let {
    kind,
    title,
    want,
    wait = null,
    href,
    held = false,
    peek = false,
    artifact,
    share,
    onchoose,
    onkeydown,
    lead,
    end,
    below,
  }: {
    /** The item's kind, the row's hook (`data-kind`). */
    kind: string;
    title: string;
    /** What it asks for, in the words it is asked: its second line. */
    want: string;
    /** How long it has waited, said short; none for a row with no wait. */
    wait?: string | null;
    /** Where a press on the row goes; none for a row answered in place. */
    href?: string;
    /** It stands but cannot be answered yet: dimmed. */
    held?: boolean;
    /** The title line ends in a control (Peek, Not now): its room is kept clear. */
    peek?: boolean;
    /** An artifact's id: its row's hook, and its end control's glyph and ink. */
    artifact?: string;
    /** The pane it opens, for a move's flight (`data-share`). */
    share: string;
    /** The row was chosen. */
    onchoose: () => void;
    /** Keys while the cover has focus (a permission's own). */
    onkeydown?: (event: KeyboardEvent) => void;
    /** The lead column's mark. */
    lead: Snippet;
    /** The title line's trailing control. */
    end?: Snippet;
    /** What stands under the want line. */
    below?: Snippet;
  } = $props();
</script>

<!-- The session's mark leading on the title's line; the title and its wait;
     what it wants, two lines at most; then the kind and where; a
     permission's peers under them. Its machine is offline: it stands,
     dimmed as every stale row is. -->
<!-- mark-line: a grid whose first row is the mark line; its words take
     .mark-text, centred on the lead (the rows under it hold other things) -->
<div
  data-slot="row"
  class="group/row relative grid min-h-c-row-h grid-cols-(--row-cols) items-baseline gap-x-space-3 rounded-sm px-space-3 py-space-2 data-stale:opacity-55"
  data-flip
  data-artifact={artifact}
  data-kind={kind}
  data-peek={peek || undefined}
  data-share={share}
  data-stale={held || undefined}
  style:--peek-glyph={artifact === undefined
    ? "var(--c-peek-glyph)"
    : "var(--icon-sm)"}
  style:--peek-ink={artifact === undefined
    ? "calc((var(--c-btn-h-xs) - var(--peek-glyph)) / 2 + var(--peek-glyph) * 1.25 / 24)"
    : "calc((var(--c-btn-h-xs) - var(--peek-glyph)) / 2 + var(--peek-glyph) * 5.25 / 24)"}
  style:--peek-room={"calc(var(--c-btn-h-xs) - var(--peek-ink) + var(--space-2))"}
  style:--row-cols="auto minmax(0, 1fr) auto"
>
  <!-- The whole row opens it; the panel closes. A choice opens nothing:
       it is answered here. Everything over the cover takes no pointer, so
       a press anywhere that is not a control opens it; the peers take
       theirs back. -->
  {#if href !== undefined}
    <a
      data-slot="cover"
      aria-label="Open {title}"
      class="press-tint focus-inset absolute inset-0 rounded-inherit hover:bg-surface-hover"
      {href}
      onclick={onchoose}
      {onkeydown}><span class="sr-only">Open {title}</span></a
    >
  {/if}
  <!-- The session's own mark, as the rail draws it; a run and a budget their
       glyphs; centred in the panel's one leading column, a notice's tile
       wide (NoticeRow), so both groups' words start on one line. -->
  <span
    data-slot="lead"
    class="pointer-events-none relative col-1 row-1 grid h-c-row-mark w-c-row-lead place-items-center self-center text-ink-muted"
  >
    {@render lead()}
  </span>
  <!-- The first row's words stand on the lead's middle (.mark-text,
       app.css). Peek, the title line's trailing cell, as a notice's ✕ is
       (NoticeRow): the wait and, with no wait, the title keep its room clear
       (`--peek-room`), `space-2` short of its box. -->
  <span
    data-slot="name"
    class={[
      "mark-text pointer-events-none relative col-2 row-1 min-w-0 self-center overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong",
      wait === null && "group-data-peek/row:pe-(--peek-room)",
    ]}>{title}</span
  >
  {#if wait !== null}
    <span
      data-slot="wait"
      class="mark-text pointer-events-none relative col-3 row-1 self-center type-meta num text-ink-muted group-data-peek/row:me-(--peek-room)"
      >{wait}</span
    >
  {/if}
  {@render end?.()}
  <span
    data-slot="want"
    class="pointer-events-none relative col-start-2 col-end-4 row-2 line-clamp-2 line-clamp-std-2 type-body wrap-anywhere text-ink-strong group-kind-choice/row:block group-kind-choice/row:line-clamp-undo group-kind-tailnet/row:block group-kind-tailnet/row:line-clamp-undo group-kind-desk/row:block group-kind-desk/row:line-clamp-undo"
    >{want}</span
  >
  {@render below?.()}
</div>
