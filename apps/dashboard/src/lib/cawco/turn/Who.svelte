<script lang="ts" module>
  /**
   * The turn's clock, one formatter for every row: `toLocaleTimeString`
   * builds the locale's formatter afresh on each call, and a row's speaker
   * line is drawn as the row mounts — a whole page of them as a pane is
   * shown or read back.
   */
  const CLOCK = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
</script>

<script lang="ts">
  /**
   * The role label leading every turn — a mark (the reader's 17px in the
   * action material, the agent's 18px in solid brand), the speaker's name at
   * the body step, and the turn's clock time held back until the reader asks
   * for it.
   *
   * The mark is 18/12 rather than the mock's 14/9 for one arithmetic reason:
   * 14 − 9 = 5 cannot split evenly, so the glyph landed 2px from one edge and
   * 3px from the other and read visibly off-centre. 18 − 12 = 6 splits 3/3.
   */
  import { IconAgent, IconUser } from "#lib/icons.js";
  import { useVoice } from "./voice";

  let {
    you = false,
    grouped = false,
    name,
    timestamp,
    note,
    live = false,
  }: {
    you?: boolean;
    /**
     * The turn in flight: a pane's own face for its speaker (`voice`) draws
     * it at work.
     */
    live?: boolean;
    /**
     * The speaker's turn right above said who this is: no mark and no name on
     * screen (the name stays for a screen reader, so every turn is still a
     * heading that says who). What is left — the clock, or the note in its
     * place — floats into the end of the turn's first line and adds no height.
     */
    grouped?: boolean;
    name: string;
    timestamp?: Date | string;
    /**
     * A word in the clock's place, for a turn that has no clock: a queued
     * message has not happened yet, so it has no time to show and this says
     * what it is instead. Always visible — unlike the clock, which is context
     * the reader hovers for, this is the row's whole status.
     */
    note?: string;
  } = $props();

  /** Who answers here, when a pane says (a project's Caw): its face is the mark. */
  const voice = useVoice();

  /** A transcript may arrive with its timestamp already serialised to a string. */
  const at = $derived(timestamp ? new Date(timestamp) : null);
  const validAt = $derived(at && !Number.isNaN(at.getTime()) ? at : null);
  const clock = $derived(validAt ? CLOCK.format(validAt) : "");
</script>

<!-- The speaker line arrives with its row: it moves with the row's own
     entrance and has no motion of its own. -->
<!-- With its mark the line is a mark line (app.css): the name and the clock
     stand on the mark's middle. Grouped it has no mark, and its clock keeps
     its own line box in the body's first line. -->
<!-- literal: 9ch -->
<h2
  data-slot="who"
  data-grouped={grouped || undefined}
  class={[
    "flex items-center gap-space-2 text-size-label text-ink-muted font-medium mb-space-2 data-grouped:float-end data-grouped:justify-end data-grouped:text-size-meta data-grouped:min-w-(--who-clock-w) data-grouped:min-h-(--who-line-h) data-grouped:mb-0 data-grouped:ms-space-3",
    !grouped && "mark-line",
  ]}
  style:--who-clock-w="9ch"
  style:--who-line-h="calc(var(--text-body) * var(--leading-body))"
>
  {#if grouped}
    <span class="sr-only">{name}</span>
  {:else}
    {#if !you && voice?.face}
      <!-- A pane's own face for its speaker stands bare in the mark's box. -->
      <span
        data-slot="dot"
        aria-hidden="true"
        class="size-(--row-mark-box) rounded-xs flex items-center justify-center leading-0 flex-none overflow-visible"
        data-face
        data-box>{@render voice.face(live)}</span
      >
    {:else}
      <!-- The reader's mark, on the pane above their well, in the action
           material: 17×17 with the top-highlight gradient and the pale glyph.
           1px narrower than the agent's 18px box, so it is centred on the same
           track by half a pixel either side. -->
      <span
        data-u={you || undefined}
        data-slot="dot"
        data-a={!you || undefined}
        aria-hidden="true"
        class="size-(--row-mark-box) rounded-xs flex items-center justify-center leading-0 flex-none data-u:size-(--row-mark) data-u:mx-(--well-x) data-u:rounded-row-mark data-u:bg-action-surface not-data-a:data-u:text-on-action data-a:bg-brand-solid data-a:text-on-brand"
        data-box
      >
        {#if you}
          <IconUser class="block size-(--row-mark-glyph)" />
        {:else}
          <IconAgent class="block size-icon-sm" />
        {/if}
      </span>
    {/if}
    <span data-slot="role" class="text-size-label font-medium text-ink-strong"
      >{name}</span
    >
  {/if}
  {#if note}
    <span
      data-slot="note"
      class="ms-auto text-size-meta font-normal text-ink-muted">{note}</span
    >
  {/if}
  {#if validAt}
    <time
      data-slot="when"
      data-after-note={note || undefined}
      class="ms-auto text-size-meta font-normal text-ink-muted tabular-nums opacity-0 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100 no-hover:opacity-100 coarse:opacity-100 motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out data-after-note:ms-0"
      datetime={validAt.toISOString()}>{clock}</time
    >
  {/if}
</h2>

<style>
  /* residual: foreign-dom */
  /* A pane's own face (a snippet this file does not render) sits in the
     mark's box at the icon step. */
  [data-slot="dot"][data-face] :global(svg) {
    display: block;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
</style>
