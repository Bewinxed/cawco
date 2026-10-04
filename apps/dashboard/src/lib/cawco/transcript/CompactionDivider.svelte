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
  import caw2x from "#lib/assets/brand/caw-compacted@2x.webp";
  import caw3x from "#lib/assets/brand/caw-compacted@3x.webp";
  /**
   * A compaction in the transcript: a wavy vermillion line across the column
   * with "Compacted" set in the middle of it. The whole divider is the button
   * that opens the compaction's brief under it; until the brief has arrived
   * there is nothing to open, and the button waits disabled. A chevron comes
   * in beside the word under the pointer or keyboard focus, and stays, turned
   * down, while the brief is open; a finger has no hover, so there it is
   * always shown. Caw, a folded note in his beak, sits before the word: he
   * is decoration and he is still — a compaction is nothing to attend to —
   * but for coming in once with the line when one lands live.
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
    ><img
      alt=""
      aria-hidden="true"
      class="caw"
      height="18"
      src={caw2x}
      srcset="{caw2x} 2x, {caw3x} 3x"
      width="19"
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
    /* How far in the chevron is: 0 away, 1 beside the word. It leaves a
       little quicker than it arrives; a state that shows it names the
       arrival's clock, since a transition runs on the clock of the state it
       is going to. */
    --chev: 0;
    --chev-dur: var(--dur-control);
    --chev-ease: var(--ease-out);
    /* Half the chevron's mark and gap: how far the centre and each arm move
       to hold it. */
    --room: calc((12px + var(--space-1)) / 2);
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
      --chev-dur: var(--dur-toggle);
      --chev-ease: var(--ease-arrive);
    }
    /* Under the pointer the line and word step to the stronger vermillion
       and the chevron comes in; nothing else. */
    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        --line: var(--brand-ink-strong);
        --chev: 1;
        --chev-dur: var(--dur-toggle);
        --chev-ease: var(--ease-arrive);
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
  /* The centre: the word, and the chevron's 12px mark a --space-1 gap after
     it. The chevron takes no room in the layout, in or out: the word stands
     where it stands without it. As it comes in the centre makes room by
     moving, never by resizing — the word steps half the chevron's width
     aside and each arm draws back the same from the centre — so the arms
     give way without a layout pass. Transitions throughout, so leaving
     half-way turns back from where it is. */
  .mid {
    white-space: nowrap;
    translate: calc(var(--chev) * var(--room) * -1) 0;
  }
  /* Caw's head, 18px tall, its middle on the word's x-height. */
  .caw {
    display: inline-block;
    vertical-align: middle;
    inline-size: auto;
    block-size: 18px;
    margin-inline-end: var(--c-pill-gap);
  }
  /* A zero-width box on the word's line, `middle` setting its mark on the
     word's x-height; the mark hangs out of it after the gap. */
  .chev {
    display: inline-block;
    vertical-align: middle;
    inline-size: 0;
    block-size: 12px;
    opacity: var(--chev);
    transition: opacity var(--chev-dur) var(--chev-ease);

    /* It slides out from the word's edge to its gap as it comes in. */
    & :global(svg) {
      display: block;
      inline-size: 12px;
      block-size: 12px;
      translate: calc(var(--chev) * var(--space-1)) 0;
      scale: calc(0.25 + 0.75 * var(--chev));
      filter: blur(calc((1 - var(--chev)) * 4px));
    }
    /* Open: it points down. */
    [aria-expanded="true"] & :global(svg) {
      rotate: 90deg;
    }
  }
  /* Each arm is the container its wave is measured against. */
  .arm {
    container-type: inline-size;
    clip-path: inset(0 0 0 calc(var(--chev) * var(--room)));

    &.start {
      clip-path: inset(0 calc(var(--chev) * var(--room)) 0 0);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .mid {
      transition:
        translate var(--chev-dur) var(--chev-ease),
        scale var(--dur-toggle) var(--ease-out);
    }
    .arm {
      transition: clip-path var(--chev-dur) var(--chev-ease);
    }
    /* The mark turns on the spot: on-screen movement, not an entrance. */
    .chev :global(svg) {
      transition:
        translate var(--chev-dur) var(--chev-ease),
        scale var(--chev-dur) var(--chev-ease),
        filter var(--chev-dur) var(--chev-ease),
        rotate var(--dur-toggle) var(--ease-in-out);
    }
    /* Landed live, Caw comes in once with the line. */
    .arriving .caw {
      animation: caw-in var(--dur-pop) var(--ease-out)
        calc(var(--dur-rail) + var(--lead)) backwards;
    }
    /* Pressed: the centre gives, the line holds. A divider is as wide as the
       column, and scaling all of it would move its ends by pixels. */
    .divider:active:not(:disabled) .mid {
      scale: var(--press-scale);
    }
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
  @keyframes caw-in {
    from {
      opacity: 0;
      scale: 0.9;
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
