<script lang="ts" module>
  /**
   * One arm of the wave, drawn from the label outward: a 16px wavelength at
   * 1.5px amplitude, longer than any column. Its svg has no viewBox, so the
   * path is in CSS pixels and the column's width only decides how much of it
   * is drawn (the dash, below): it repeats, it is never scaled.
   */
  const WAVE = `M1 3q4-3 8 0${"t8 0".repeat(599)}`;
</script>

<script lang="ts">
  /**
   * A compaction in the transcript: a wavy vermillion line across the column
   * with "Compacted" set in the middle of it. The whole divider is the button
   * that opens the compaction's brief under it; until the brief has arrived
   * there is nothing to open, and the button waits disabled. A chevron comes
   * in beside the word under the pointer or keyboard focus, and stays, turned
   * down, while the brief is open; a finger has no hover, so there it is
   * always shown.
   */
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import MessageBody from "./MessageBody.svelte";
  import type { Row } from "./rows";

  let {
    row,
    lead = null,
  }: {
    row: Extract<Row, { kind: "compaction" }>;
    /**
     * Its place in the burst it arrived in (ms), when it landed live in a
     * watched transcript: the wave draws in once, from the label outward.
     * Null for a compaction read back from history, which is simply there.
     */
    lead?: number | null;
  } = $props();

  const disclosed = $derived(disclosureAt(row.session, row.key));
  const open = $derived(row.brief !== null && disclosed.get());

  /** "Automatic · 182k tokens before": only the facts the harness reported. */
  const facts = $derived(
    [
      row.trigger && (row.trigger === "manual" ? "Manual" : "Automatic"),
      row.preTokens && `${Math.round(row.preTokens / 1000)}k tokens before`,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  /**
   * The reader opened it: the transcript lets go of the tail, so the divider
   * they pressed holds its place and the brief opens downward (Transcript's
   * `onrevealstart`).
   */
  function opening(event: Event): void {
    event.currentTarget?.dispatchEvent(
      new CustomEvent("revealstart", { bubbles: true })
    );
  }
</script>

<button
  aria-expanded={row.brief === null ? undefined : open}
  aria-label={row.brief === null
    ? undefined
    : `Compacted, ${open ? "hide" : "show"} the summary`}
  class="divider focus-inset touch-hit"
  disabled={row.brief === null}
  onclick={() => disclosed.set(!open)}
  type="button"
  style:--lead={lead === null ? undefined : `${lead}ms`}
  class:arriving={lead !== null}
>
  <span class="arm start">
    <svg aria-hidden="true" class="wave"><path d={WAVE} /></svg>
  </span>
  <span class="mid"
    >Compacted<span class="chev"><IconChevron aria-hidden="true" /></span></span
  >
  <span class="arm">
    <svg aria-hidden="true" class="wave"><path d={WAVE} /></svg>
  </span>
</button>
{#if open && row.brief !== null}
  <div class="brief" data-state="open" onintrostart={opening} transition:unfold>
    <div class="body" {@attach morph()}>
      {#if facts}
        <p class="facts">{facts}</p>
      {/if}
      <MessageBody source={row.brief} />
    </div>
  </div>
{/if}

<style>
  .divider {
    --line: var(--brand-solid);
    /* How far in the chevron is: 0 away, 1 beside the word. */
    --chev: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-sm);
    margin-block-start: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--brand-ink);
    cursor: pointer;

    &:disabled {
      cursor: default;
    }
    /* The chevron is in for keyboard focus and while the brief is open. */
    &:is(:focus-visible, [aria-expanded="true"]) {
      --chev: 1;
    }
    /* Under the pointer the line and word step to the stronger vermillion
       and the chevron comes in; nothing else. */
    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        --line: var(--brand-ink-strong);
        --chev: 1;
        color: var(--brand-ink-strong);
      }
    }
    /* A finger has no hover: what opens always shows that it does. */
    @media (pointer: coarse) {
      &:not(:disabled) {
        --chev: 1;
      }
    }
    transition: color var(--dur-control) var(--ease-out);
  }
  .mid {
    white-space: nowrap;
  }
  /* The chevron takes no room until it is in: the word stands where it
     stands without it, and the centre widens as it comes, so the arms give
     way rather than jump. `middle` sets it on the word's x-height. */
  .chev {
    display: inline-block;
    vertical-align: middle;
    inline-size: calc(var(--chev) * 12px);
    block-size: 12px;
    margin-inline-start: calc(var(--chev) * var(--space-1));
    opacity: var(--chev);
    transition: opacity var(--dur-control) var(--ease-out);

    & :global(svg) {
      display: block;
      inline-size: 12px;
      block-size: 12px;
      scale: calc(0.25 + 0.75 * var(--chev));
      filter: blur(calc((1 - var(--chev)) * 4px));
    }
    /* Open: it points down. */
    [aria-expanded="true"] & :global(svg) {
      rotate: 90deg;
    }
    /* Transitions, so leaving half-way turns back from where it is. */
    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-control) var(--ease-out),
        inline-size var(--dur-control) var(--ease-out),
        margin-inline-start var(--dur-control) var(--ease-out);

      & :global(svg) {
        transition:
          scale var(--dur-control) var(--ease-out),
          filter var(--dur-control) var(--ease-out),
          rotate var(--dur-toggle) var(--ease-out);
      }
    }
  }
  /* Each arm is the container its wave is measured against. */
  .arm {
    container-type: inline-size;
  }
  .wave {
    display: block;
    inline-size: 100%;
    block-size: 6px;

    /* Mirrored, so both arms run outward from the word. */
    .start > & {
      transform: scaleX(-1);
    }

    & path {
      /* How much of the path the arm shows, along the curve: the wave is
         1.087px long for each pixel it crosses. Dashed to that length, the
         line ends on a round cap just inside the column, not on a clip. */
      --run: calc((100cqi - 2px) * 1.08);
      fill: none;
      stroke: var(--line);
      /* One pixel, in whole device pixels. */
      stroke-width: max(var(--dpx, 1px), round(1px, var(--dpx, 1px)));
      stroke-linecap: round;
      stroke-dasharray: var(--run) 9999px;
      transition: stroke var(--dur-control) var(--ease-out);
    }
  }
  /* Landed live: the line draws in once, from the word outward, as the row's
     own entrance fades it up (Row's arrival: the place opens over --dur-rail,
     then the content comes in). */
  @media (prefers-reduced-motion: no-preference) {
    .arriving .wave path {
      animation: wave-draw var(--dur-pop) var(--ease-out)
        calc(var(--dur-rail) + var(--lead)) backwards;
    }
  }
  @keyframes wave-draw {
    from {
      stroke-dashoffset: var(--run);
    }
  }

  /* The brief, at the text column, where a note's body opens. */
  .brief {
    margin-inline-start: var(--x-text);
    padding-block-start: var(--space-1);
  }
  .facts {
    margin-block-end: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The brief reads in the muted ink of a note, not a turn's. */
  .body :global(.msg),
  .body :global(.msg .prose),
  .body :global(.msg .prose :is(h1, h2, h3, h4, h5, h6)) {
    color: var(--ink-muted);
  }
  .body :global(.msg .prose) {
    --tw-prose-body: var(--ink-muted);
    --tw-prose-headings: var(--ink-muted);
    --tw-prose-bold: var(--ink-muted);
  }
</style>
