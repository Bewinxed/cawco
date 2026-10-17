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
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconError } from "#lib/icons.js";
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import Caw from "../home/Caw.svelte";
  import CawMark from "../home/CawMark.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { dur } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { compactionFailure } from "./compaction-failure";
  import { COMPACTING_MARK, COMPACTION_MARK } from "./compaction-mark";
  import { disclosureAt } from "./disclosure.svelte";
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

<!-- Half the chevron's mark and gap: how far the centre and each arm move to
     hold it. -->
<!-- literal: minmax(0, 1fr) auto minmax(0, 1fr), 12px -->
<button
  data-compaction-divider-live={live || undefined}
  data-compaction-divider-failed={failed || undefined}
  data-slot="divider"
  aria-expanded={row.brief === null || failed ? undefined : open}
  aria-label={row.brief === null || failed
    ? undefined
    : `Compacted, ${open ? "hide" : "show"} the summary`}
  class="group/divider grid grid-cols-(--cols) items-center gap-space-2 w-full min-h-c-btn-h-sm mt-space-2 p-0 border-none border-current bg-transparent type-meta text-brand-ink cursor-pointer transition-[color] dur-control ease-out disabled:cursor-default hover:enabled:text-brand-ink-strong data-failed:block data-failed:text-start data-failed:text-status-fail-ink focus-inset touch-hit"
  disabled={row.brief === null || failed}
  onclick={() => disclosed.set(!open)}
  type="button"
  style:--lead={lead === null ? undefined : `${lead}ms`}
  style:--cols="minmax(0, 1fr) auto minmax(0, 1fr)"
  style:--room="calc((12px + var(--space-1)) / 2)"
  data-arriving={(lead !== null && !watched) || undefined}
  data-failed={failed || undefined}
  data-live={live || undefined}
  data-settled={(watched && row.state === "done") || undefined}
  data-settling={settlingNow || undefined}
  {@attach watched && morph()}
>
  <!-- Each arm is the container its wave is measured against. -->
  <!-- Mirrored, so both arms run outward from the word.
       literal: scaleX(-1) -->
  <span
    class="arm start @container group-data-failed/divider:hidden motion-safe:transition-[clip-path] motion-safe:duration-(--chev-dur) motion-safe:ease-(--chev-ease) motion-reduce:group-data-live/divider:opacity-0 motion-reduce:group-data-settled/divider:transition-[opacity] motion-reduce:group-data-settled/divider:dur-fade motion-reduce:group-data-settled/divider:ease-out"
  >
    <svg
      aria-hidden="true"
      style:--wave-flip="scaleX(-1)"
      class="wave block w-full h-(--tx-compact-wave) transform-(--wave-flip)"
      ><path
        d={WAVE}
        style:--run="calc((100cqi - 2px) * 1.08)"
        style:--dash-gap="9999px"
        style:--wave-stroke="max(var(--dpx, 1px), round(1px, var(--dpx, 1px)))"
        class="fill-none stroke-(--line) stroke-(length:--wave-stroke) transition-[stroke] dur-control ease-out"
      /></svg
    >
  </span>
  <!-- mark-line: a line of text; Caw and the chevron stand in it on
       vertical-align: middle, the x-height's middle. The centre: the word,
       and the chevron's 12px mark a --space-1 gap after it. The chevron
       takes no room in the layout, in or out: as it comes in the centre
       makes room by moving, never by resizing; pressed, the centre gives
       and the line holds. -->
  <span
    style:--mid-x="calc(var(--chev) * var(--room) * -1)"
    class="mid whitespace-nowrap translate-x-(--mid-x) group-data-failed/divider:hidden motion-safe:group-active/divider:group-enabled/divider:scale-(--press-scale)"
    ><!-- Caw's slot: his still's box, its middle on the word's x-height; as
          wide as Caw at work while it runs, closing to his mark's box as it
          ends, on the line's clock. --><span
      class="relative inline-block align-middle w-(--tx-compact-caw) h-(--tx-compact-caw) me-c-pill-gap group-data-live/divider:w-(--tx-compacting-caw) motion-safe:transition-[inline-size,margin-inline-end] motion-safe:dur-panel motion-safe:ease-out"
      data-caw
      >{#if working}
        <!-- literal: 0 -->
        <span
          style:--stand-leading="0"
          class="absolute top-1/2 left-1/2 block leading-(--stand-leading) -translate-1/2"
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
        <!-- literal: 0 -->
        <span
          style:--stand-leading="0"
          class="absolute top-1/2 left-1/2 block leading-(--stand-leading) -translate-1/2"
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
    ><!-- literal: -0.5em --><span
      style:--word-clip="inset(-0.5em 0)"
      class="word"
      >{#if failed}
        <!-- A compaction that failed never reads "Compacted", seen or not. -->
      {:else if watched}
        <MorphText text={live ? "Compacting…" : "Compacted"} />
      {:else}
        Compacted
      {/if}</span
    ><!-- A zero-width box on the word's line, `middle` setting its mark on
          the word's x-height; the mark hangs out of it after the gap,
          sliding out from the word's edge as it comes in, and points down
          while the brief is open. --><!-- literal: 4px --><span
      data-slot="chev"
      style:--chev-x="calc(var(--chev) * var(--space-1))"
      style:--chev-scale="calc(0.25 + 0.75 * var(--chev))"
      style:--chev-blur="calc((1 - var(--chev)) * 4px)"
      class="inline-block align-middle w-0 h-icon-sm opacity-(--chev) transition-[opacity] duration-(--chev-dur) ease-(--chev-ease)"
      ><IconChevron
        aria-hidden="true"
        class="block size-icon-sm translate-x-(--chev-x) scale-(--chev-scale) group-aria-expanded/divider:rotate-90"
      /></span
    ></span
  >
  <span
    class="arm @container group-data-failed/divider:hidden motion-safe:transition-[clip-path] motion-safe:duration-(--chev-dur) motion-safe:ease-(--chev-ease) motion-reduce:group-data-live/divider:opacity-0 motion-reduce:group-data-settled/divider:transition-[opacity] motion-reduce:group-data-settled/divider:dur-fade motion-reduce:group-data-settled/divider:ease-out"
  >
    <svg aria-hidden="true" class="wave block w-full h-(--tx-compact-wave)"
      ><path
        d={WAVE}
        style:--run="calc((100cqi - 2px) * 1.08)"
        style:--dash-gap="9999px"
        style:--wave-stroke="max(var(--dpx, 1px), round(1px, var(--dpx, 1px)))"
        class="fill-none stroke-(--line) stroke-(length:--wave-stroke) transition-[stroke] dur-control ease-out"
      /></svg
    >
  </span>
  {#if failed}
    <!-- The transcript's failure line, on the rail: what happened on the
         line, why and the way on hung at the text column (SystemLine). No
         line, no Caw — he is never in an error — and nothing centred. -->
    <span
      style:--fail-pad="calc(var(--x-glyph) - var(--x-rail))"
      class="fail block ms-(--x-rail) ps-(--fail-pad) text-size-label font-medium leading-body"
      in:fade={{ duration: dur("--dur-fade") }}
    >
      <span class="rail-line"
        ><span data-slot="rail-cell" class="rail-cell"
          ><IconError class="size-icon-sm" /></span
        ><b>Couldn't compact the conversation</b></span
      >
      <span
        data-slot="reason"
        class="block mt-space-1 text-pretty rail-hang">{reason}</span
      >
    </span>
  {/if}
</button>
{#if watched}
  <span class="sr-only" role="status">{spoken}</span>
{/if}
{#if open && row.brief !== null}
  <!-- The brief, at the text column, where a note's body opens. -->
  <div
    class="ms-(--x-text) pt-space-1"
    data-state="open"
    onintrostart={opening}
    transition:unfold
  >
    <div data-slot="body" {@attach morph()}>
      {#if facts}
        <p class="mb-space-2 type-meta text-ink-muted">{facts}</p>
      {/if}
      <MessageBody source={row.brief} />
    </div>
  </div>
{/if}

<style>
  /* residual: unmapped: the chevron's clock and the line's ink are custom
     properties the button's own states rewrite (focus, open, hover, a
     finger, settling), and every part of the row reads them; a state has no
     utility that sets a custom property. How far in the chevron is: 0
     away, 1 beside the word. It leaves a little quicker than it arrives; a
     state that shows it names the arrival's clock, since a transition runs
     on the clock of the state it is going to. */
  [data-slot="divider"] {
    --line: var(--brand-solid);
    --chev: 0;
    --chev-dur: var(--dur-control);
    --chev-ease: var(--ease-out);

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
    &[data-settling] {
      --chev: 0;
    }
  }
  /* While the word turns from "Compacting…" to "Compacted" its box takes the
     new word's width at once and the letters leaving fade past its end.
     Clipped across, never up or down, the word is its box throughout. Each
     arm draws back from the centre as the chevron comes in. */
  [data-settling] .word {
    clip-path: var(--word-clip);
  }
  .arm {
    clip-path: inset(0 0 0 calc(var(--chev) * var(--room)));

    &.start {
      clip-path: inset(0 calc(var(--chev) * var(--room)) 0 0);
    }
  }
  /* The failure line's rail. */
  .fail {
    background: linear-gradient(var(--status-fail-ink), var(--status-fail-ink))
      left top / 2px 100% no-repeat;
  }
  /* The chevron's mark sharpens as it comes in. */
  [data-slot="chev"] :global(svg) {
    filter: blur(var(--chev-blur));
  }
  /* Two clocks per element: the chevron's, and the press's or the turn's. */
  @media (prefers-reduced-motion: no-preference) {
    .mid {
      transition:
        translate var(--chev-dur) var(--chev-ease),
        scale var(--dur-toggle) var(--ease-out);
    }
    /* The mark turns on the spot: on-screen movement, not an entrance. */
    [data-slot="chev"] :global(svg) {
      transition:
        translate var(--chev-dur) var(--chev-ease),
        scale var(--chev-dur) var(--chev-ease),
        filter var(--chev-dur) var(--chev-ease),
        rotate var(--dur-toggle) var(--ease-in-out);
    }
  }
  /* residual: svg-paint: how much of the path the arm shows, along the
     curve: the wave is 1.087px long for each pixel it crosses. Dashed to
     that length, the line ends on a round cap just inside the column. */
  .wave path {
    stroke-linecap: round;
    stroke-dasharray: var(--run) var(--dash-gap);
  }
  /* residual: keyframes: landed live, the line draws in once, from the word
     outward, as the row's own entrance fades it up (Row's arrival: the
     place opens over --dur-rail, then the content comes in). */
  @media (prefers-reduced-motion: no-preference) {
    [data-arriving] .wave path {
      animation: wave-draw var(--dur-pop) var(--ease-out)
        calc(var(--dur-rail) + var(--lead)) backwards;
    }
    /* A compaction watched to its end: the line draws out from the word
       as the row settles. */
    [data-settled] .wave path {
      animation: wave-draw var(--dur-pop) var(--ease-out) backwards;
    }
    /* While it compacts the line breathes, two breaths a loop: it draws out
       from the word over the first, then fades where it stands over the
       second, and draws again. Two animations on one clock, since an easing
       per keyframe can't name a token: each easing runs its own half, and
       the other half holds. */
    [data-live] .wave path {
      animation:
        wave-breath-draw calc(var(--breath) * 2) var(--ease-out) infinite,
        wave-breath-fade calc(var(--breath) * 2) var(--ease-in-out) infinite;
    }
  }
  @keyframes wave-breath-draw {
    0% {
      stroke-dashoffset: var(--run);
    }
    50%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  @keyframes wave-breath-fade {
    0%,
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes wave-draw {
    from {
      stroke-dashoffset: var(--run);
    }
  }

  /* residual: foreign-dom: MessageBody's message and its prose, which take
     no class; the brief reads in the muted ink of a note, not a turn's. */
  [data-slot="body"] :global([data-slot="msg"]),
  [data-slot="body"] :global([data-slot="msg"] .prose),
  [data-slot="body"] :global([data-slot="msg"] .prose :is(h1, h2, h3, h4, h5, h6)) {
    color: var(--ink-muted);
  }
  [data-slot="body"] :global([data-slot="msg"] .prose) {
    --tw-prose-body: var(--ink-muted);
    --tw-prose-headings: var(--ink-muted);
    --tw-prose-bold: var(--ink-muted);
  }
</style>
