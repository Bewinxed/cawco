<script lang="ts">
  /**
   * The role label leading every turn — an 18px mark (raised for the reader,
   * solid brand for the agent), the speaker's name at the body step, and the
   * turn's clock time held back until the reader asks for it.
   *
   * The mark is 18/12 rather than the mock's 14/9 for one arithmetic reason:
   * 14 − 9 = 5 cannot split evenly, so the glyph landed 2px from one edge and
   * 3px from the other and read visibly off-centre. 18 − 12 = 6 splits 3/3.
   */
  import { IconAgent, IconUser } from "$lib/icons";

  let {
    you = false,
    name,
    timestamp,
    note,
  }: {
    you?: boolean;
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
<h2 class="who">
  <span aria-hidden="true" class="dot {you ? 'u' : 'a'}">
    {#if you}
      <IconUser />
    {:else}
      <IconAgent />
    {/if}
  </span>
  <span class="role">{name}</span>
  {#if validAt}
    <time class="when" datetime={validAt.toISOString()}>{clock}</time>
  {:else if note}
    <span class="note">{note}</span>
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
    /* The reader's mark sits inside the sunken well of its own turn, so it is
       raised out of that surface rather than cut into it. */
    &.u {
      background: var(--surface-raised);
      border: 1px solid var(--border-control);
      color: var(--ink-strong);

      /* solar's user glyph fills 17.5 of its 24 viewBox; the ghost fills
         21.5. At the same 12px box the user mark read a step smaller, so it
         is scaled rather than resized — optical over geometric, and scaling
         from the centre leaves the 3/3 split exact where a size bump would
         break its parity. */
      & :global(svg) {
        transform: scale(1.1);
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
</style>
