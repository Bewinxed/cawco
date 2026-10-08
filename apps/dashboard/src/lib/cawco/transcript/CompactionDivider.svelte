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
   * always shown. Caw, a folded note in his beak, sits before the word,
   * drawn from his `compacted` file: he is decoration and he rests — a
   * compaction is nothing to attend to — but for coming in once, by that
   * file's own clip, with the line when one lands live.
   *
   * A compaction this transcript watched begin is the same row from its
   * first moment (rows.ts `Told`). While the harness compacts, Caw works
   * in its middle, a size up, beside "Compacting…", with no line and
   * nothing to open. When it is done the row settles into the divider at
   * rest, in place: Caw at work leaves by his own leave as the slot he
   * stands in closes to his mark's box, and his `compacted` file plays its
   * enter there; the word morphs to "Compacted" and the line draws out
   * from it. One that failed says so in one line where the divider would
   * be, with no line and no Caw: he is never in an error.
   */
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import { IconError } from "#lib/icons.js";
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import Caw from "../home/Caw.svelte";
  import CawMark from "../home/CawMark.svelte";
  import { dur, morphMs } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { compactionFailure } from "./compaction-failure";
  import { COMPACTING_MARK, COMPACTION_MARK } from "./compaction-mark";
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

  /**
   * This mount saw it compacting: it settles here, Caw at work is this
   * mount's, and it says how it went. A row mounted after that — scrolled
   * back to, read from history — is simply at rest.
   */
  const watched = untrack(() => row.state === "compacting");
  const live = $derived(row.state === "compacting");
  const failed = $derived(row.state === "failed");
  /** Caw at work is on the page: until his leave has played out. */
  let working = $state(watched);

  /** Why it failed and the way on, under the line that says it did. */
  const reason = $derived(compactionFailure(row.error));

  /**
   * The settle is under way: the word is still turning into "Compacted" and
   * Caw into his mark. Nothing that offers the brief comes in until it is
   * over — the chevron a finger always sees would say there is something to
   * open under a word still reading "Compacting".
   */
  let settlingNow = $state(false);
  $effect(() => {
    if (!(watched && row.state === "done")) {
      return;
    }
    settlingNow = true;
    const over = setTimeout(() => {
      settlingNow = false;
    }, dur("--dur-panel"));
    return () => clearTimeout(over);
  });

  /**
   * What the row says to a screen reader, as it changes: that the
   * compaction began, then how it ended. Written a frame after the region
   * is on the page, so its first words are an announcement and not part
   * of a region being born.
   */
  let spoken = $state("");
  $effect(() => {
    if (!watched) {
      return;
    }
    let said = "Compacted";
    if (live) {
      said = "Compacting…";
    } else if (failed) {
      said = `Couldn't compact the conversation. ${reason}`;
    }
    const frame = requestAnimationFrame(() => {
      spoken = said;
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * When his mark's coming in starts: once Caw at work has left, when he
   * settles here; behind the row's own entrance, when it landed live.
   */
  function markDelay(): number {
    if (watched) {
      return dur("--dur-fade");
    }
    return lead === null ? 0 : dur("--dur-rail") + lead;
  }

  const disclosed = $derived(disclosureAt(row.session, row.key));
  const open = $derived(row.brief !== null && !failed && disclosed.get());

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
  aria-expanded={row.brief === null || failed ? undefined : open}
  aria-label={row.brief === null || failed
    ? undefined
    : `Compacted, ${open ? "hide" : "show"} the summary`}
  class="divider focus-inset touch-hit"
  disabled={row.brief === null || failed}
  onclick={() => disclosed.set(!open)}
  type="button"
  style:--lead={lead === null ? undefined : `${lead}ms`}
  class:arriving={lead !== null && !watched}
  class:failed
  class:live
  class:settled={watched && row.state === "done"}
  class:settling={settlingNow}
  {@attach watched && morph()}
>
  <span class="arm start">
    <svg aria-hidden="true" class="wave"><path d={WAVE} /></svg>
  </span>
  <span class="mid"
    ><span class="caw" data-caw
      >{#if working}
        <span class="stand"
          ><Caw
            next={[COMPACTION_MARK.status]}
            ongone={() => {
              working = false;
            }}
            present={live}
            size={COMPACTING_MARK.size}
            status={COMPACTING_MARK.status}
          /></span
        >
      {/if}
      {#if !(live || failed)}
        <span
          class="stand"
          in:fade={{ duration: watched ? dur("--dur-fade") : 0 }}
          ><CawMark
            arrival={watched || lead !== null
              ? `${row.session}:${row.key}`
              : null}
            delay={markDelay()}
            size={COMPACTION_MARK.size}
            status={COMPACTION_MARK.status}
          /></span
        >
      {/if}</span
    ><span class="word"
      >{#if failed}
        <!-- A compaction that failed never reads "Compacted", seen or not. -->
      {:else if watched}
        <TextMorph
          as="span"
          duration={morphMs()}
          text={live ? "Compacting…" : "Compacted"}
        />
      {:else}
        Compacted
      {/if}</span
    ><span class="chev"><IconChevron aria-hidden="true" /></span></span
  >
  <span class="arm">
    <svg aria-hidden="true" class="wave"><path d={WAVE} /></svg>
  </span>
  {#if failed}
    <!-- The transcript's failure line, on the rail: what happened on the
         line, why and the way on hung at the text column (SystemLine). -->
    <span class="fail" in:fade={{ duration: dur("--dur-fade") }}>
      <span class="rail-line"
        ><span class="rail-cell"><IconError /></span
        ><b>Couldn't compact the conversation</b></span
      >
      <span class="reason rail-hang">{reason}</span>
    </span>
  {/if}
</button>
{#if watched}
  <span class="sr-only" role="status">{spoken}</span>
{/if}
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
    /* Settling, nothing offers the brief yet: the chevron comes in once the
       word reads "Compacted", on its own clock. */
    &.settling {
      --chev: 0;
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
  /* While the word turns from "Compacting…" to "Compacted" its box takes the
     new word's width at once and the letters leaving fade past its end: the
     cluster read 3.5px off centre for the morph. Clipped across, never up or
     down, the word is its box throughout. */
  .settling .word {
    clip-path: inset(-0.5em 0);
  }
  /* Caw's slot: his still's 18px box, its middle on the word's x-height.
     His rim and his coming in draw a little past it and take no room. One
     slot from the compaction's first moment to its end: while it runs it
     is as wide as Caw at work (he stands taller than the line and takes no
     height, so the row never changes height), and as it ends it closes to
     his mark's box, the word riding in with it. */
  .caw {
    position: relative;
    display: inline-block;
    vertical-align: middle;
    inline-size: var(--tx-compact-caw);
    block-size: var(--tx-compact-caw);
    margin-inline-end: var(--c-pill-gap);

    .live & {
      inline-size: var(--tx-compacting-caw);
    }
  }
  /* Whoever stands in the slot, centred on it whatever its width: Caw at
     work leaving where he worked as his mark comes in where it rests. */
  .stand {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    line-height: 0;
    translate: -50% -50%;
  }
  /* Failed: the transcript's failure line where the divider stood, on the
     rail like every other line (SystemLine's `.note.fail`): no line, no Caw
     — he is never in an error — and nothing centred. */
  .failed {
    display: block;
    text-align: start;
    color: var(--status-fail-ink);

    & > :is(.arm, .mid) {
      display: none;
    }
  }
  .fail {
    display: block;
    margin-inline-start: var(--x-rail);
    padding-inline-start: calc(var(--x-glyph) - var(--x-rail));
    background:
      linear-gradient(var(--status-fail-ink), var(--status-fail-ink)) left top /
      2px 100% no-repeat;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    line-height: var(--leading-body);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .reason {
    display: block;
    margin-block-start: var(--space-1);
    text-wrap: pretty;
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
    /* While it runs there is no line. */
    .live & {
      opacity: 0;
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
    /* The slot closes from Caw at work's width to his mark's as the
       compaction ends, on the same clock as the line drawing out. */
    .caw {
      transition:
        inline-size var(--dur-panel) var(--ease-out),
        margin-inline-end var(--dur-panel) var(--ease-out);
    }
    /* The mark turns on the spot: on-screen movement, not an entrance. */
    .chev :global(svg) {
      transition:
        translate var(--chev-dur) var(--chev-ease),
        scale var(--chev-dur) var(--chev-ease),
        filter var(--chev-dur) var(--chev-ease),
        rotate var(--dur-toggle) var(--ease-in-out);
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
    /* A compaction watched to its end: the line draws out from the word
       as the row settles. */
    .settled .wave path {
      animation: wave-draw var(--dur-pop) var(--ease-out) backwards;
    }
  }
  /* With less motion the line is not drawn: it fades in where it stands. */
  @media (prefers-reduced-motion: reduce) {
    .settled .arm {
      transition: opacity var(--dur-fade) var(--ease-out);
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
