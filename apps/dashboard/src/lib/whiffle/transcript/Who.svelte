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
  import { IconAgent, IconUser } from "$lib/icons";

  let {
    you = false,
    grouped = false,
    name,
    timestamp,
    note,
  }: {
    you?: boolean;
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
     * the reader hovers for, this is the row's whole status. A turn with a
     * clock can carry one too (an urgent send): it stands before the clock.
     */
    note?: string;
  } = $props();

  /** A transcript may arrive with its timestamp already serialised to a string. */
  const at = $derived(timestamp ? new Date(timestamp) : null);
  const validAt = $derived(at && !Number.isNaN(at.getTime()) ? at : null);
  const clock = $derived(
    validAt
      ? validAt.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : ""
  );
</script>

<!-- The speaker line arrives with its row: it moves with the row's own
     entrance and has no motion of its own. -->
<h2 class="who" class:grouped>
  {#if grouped}
    <span class="sr-only">{name}</span>
  {:else}
    <span aria-hidden="true" class="dot {you ? 'u' : 'a'}">
      {#if you}
        <IconUser />
      {:else}
        <IconAgent />
      {/if}
    </span>
    <span class="role">{name}</span>
  {/if}
  {#if note}
    <span class="note">{note}</span>
  {/if}
  {#if validAt}
    <time class="when" datetime={validAt.toISOString()}>{clock}</time>
  {/if}
</h2>

<style>
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    color: var(--ink-muted);
    font-weight: var(--weight-strong);
    margin-block-end: var(--space-2);

    /* One line box of the body tall, so the clock sits centred on the turn's
       first line; the body wraps around it rather than moving down. As wide
       as the widest word the slot holds ("sending…"), whatever it holds now,
       so the first line wraps the same while sending, queued, streaming and
       settled — settling moves nothing. */
    &.grouped {
      float: inline-end;
      justify-content: flex-end;
      font-size: var(--text-meta);
      min-inline-size: 9ch;
      min-block-size: calc(var(--text-body) * var(--leading-body));
      margin-block-end: 0;
      margin-inline-start: var(--space-3);
    }
  }
  .dot {
    inline-size: 18px;
    block-size: 18px;
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    /* an inline svg would otherwise sit on the line box's baseline */
    line-height: 0;
    flex: 0 0 auto;

    & :global(svg) {
      display: block;
      inline-size: 12px;
      block-size: 12px;
    }
    /* The reader's mark, on the pane above their well, in the action
       material: 17×17 with the top-highlight gradient and the pale glyph.
       1px narrower than the agent's 18px box, so it is centred on the same
       track by half a pixel either side. */
    &.u {
      inline-size: var(--row-mark);
      block-size: var(--row-mark);
      margin-inline: 0.5px;
      border-radius: var(--row-mark-r);
      background: var(--action-grad);
      color: var(--mark-glyph);

      & :global(svg) {
        inline-size: var(--row-mark-glyph);
        block-size: var(--row-mark-glyph);
      }
    }
    &.a {
      background: var(--brand-solid);
      color: var(--on-brand);
    }
  }
  .role {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* Where the clock would be, at the same size and colour, because it is the
     same slot answering a different question: not "when did this happen" but
     "this has not happened yet". */
  .note {
    margin-inline-start: auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  /* The clock is context, not content: it appears when the reader is on the
     turn and is otherwise absent from the skim. */
  .when {
    margin-inline-start: auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
    opacity: 0;

    :global(.turn:hover) &,
    :global(.turn:focus-within) & {
      opacity: 1;
    }
    /* No hover to reveal it with, so it is simply always there. */
    @media (hover: none), (pointer: coarse) {
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  /* A note and a clock together: the note takes the push, the clock follows it. */
  .note + .when {
    margin-inline-start: 0;
  }
</style>
