<script lang="ts" module>
  /**
   * How the code's letters stand: a skeleton while the hub is asked, the
   * code while it waits, the done or fail ink once answered, dimmed once it
   * expired (stale), and boxes with nothing in them (empty).
   */
  export type OtpTone =
    "skeleton" | "code" | "done" | "fail" | "stale" | "empty";
</script>

<script lang="ts">
  /**
   * The key's letters: six boxes in two groups of three (the code's hyphen
   * is the gap between them), each holding one letter at the KPI role in
   * the mono face, the row c-pair-w wide, the width of the QR or camera
   * above it. Every box is drawn in every state: the stat well's recess
   * fill and a 1px field edge (`input`). It reads out as one element,
   * letter by letter.
   *
   * ANIMATION STORYBOARD (CSS animations on transform and opacity)
   *
   *   type in  each letter up from pop-rise and sharp from fold-blur over
   *            dur-pop, box k at k × dur-ghost: the last lands as the key's
   *            dots lock (Number pop-in, on the key's beat)
   *   pulse    the letters breathe once a breath while the person checks
   *            them against their phone
   *   leave    letters go up by swap-rise over dur-morph, all at once
   *            (Text states swap's exit)
   *   fall     box by box, k × dur-stagger apart, each drops its height on
   *            the gravity curve and fades (a dead code)
   *   done     the done ink crosses the boxes k × dur-stagger apart
   *   shake    Error state shake on the row
   *
   * Without motion, letters and inks only fade.
   */
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeInOut, motionOk, numberOf } from "../motion/curves.svelte";

  let {
    code,
    tone,
    shake = 0,
    pulsing = false,
    falling = false,
  }: {
    /** "JWK-HDQ", or null while there is none to show. */
    code: string | null;
    tone: OtpTone;
    /** Each rise replays the shake. */
    shake?: number;
    /** The person is checking these against their phone. */
    pulsing?: boolean;
    /** A dead code: the boxes fall apart. */
    falling?: boolean;
  } = $props();

  const CELLS = [0, 1, 2, 3, 4, 5] as const;
  const letters = $derived(code ? code.replace(/[^A-Z]/gi, "").split("") : []);
  const spoken = $derived(
    letters.length === 6
      ? `Pairing code ${letters.slice(0, 3).join(" ")}, ${letters.slice(3).join(" ")}`
      : ""
  );

  /** Mounted: letters type in only for a code that arrives, never on first paint. */
  let settled = false;
  $effect(() => {
    settled = true;
  });
  const arriving = (node: HTMLElement) => {
    if (settled) {
      node.classList.add("arriving");
    }
  };

  function leave(_node: Element): TransitionConfig {
    const rise = motionOk.current ? numberOf("--swap-rise") : 0;
    const blur = motionOk.current ? numberOf("--fold-blur") : 0;
    return {
      duration: dur("--dur-morph"),
      easing: easeInOut,
      css: (t, u) =>
        `opacity: ${t}; transform: translateY(${-u * rise}px); filter: blur(${u * blur}px)`,
    };
  }

  /* Error state shake: the class comes off, a reflow, and it goes on again,
     so every rise replays it from rest. */
  let row = $state<HTMLElement>();
  let shook: number | null = null;
  $effect(() => {
    const was = shook;
    shook = shake;
    if (was === null || shake === was || !row) {
      return;
    }
    row.classList.remove("shaking");
    // biome-ignore lint/complexity/noVoid: the reflow is the recipe's replay
    void row.offsetWidth;
    row.classList.add("shaking");
  });
</script>

<div
  data-slot="otp"
  class="otp"
  data-falling={falling || undefined}
  data-pulsing={pulsing || undefined}
  data-tone={tone}
>
  {#if spoken}
    <span class="sr-only">{spoken}</span>
  {/if}
  <div
    bind:this={row}
    aria-hidden="true"
    class="row"
    onanimationend={(event) => {
      if (event.animationName.endsWith("otp-shake")) {
        row?.classList.remove("shaking");
      }
    }}
  >
    {#each CELLS as at (at)}
      <span class="cell" style:--at={at}>
        <span class="band"></span>
        <!-- The glyph stands directly in the code's block: transitions are
             local, so a new code (or none) plays its arrival and its leave. -->
        {#key code}
          <span class="glyph" out:leave {@attach arriving}
            >{letters[at] ?? ""}</span
          >
        {/key}
      </span>
    {/each}
  </div>
</div>

<style>
  .otp {
    display: grid;
    justify-items: center;
    inline-size: 100%;
  }
  /* c-pair-w wide, said rather than found: a flex row's own width is its
     items' content (a letter each), never their basis. Two groups of three,
     space-2 between boxes and space-5 at the hyphen; a narrower container
     narrows every box alike. */
  .row {
    display: flex;
    gap: var(--space-2);
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
  }
  .cell {
    --x: calc(
      var(--at) * (var(--c-otp-cell-w) + var(--space-2)) +
        min(1, max(0, var(--at) - 2)) * (var(--space-5) - var(--space-2))
    );
    position: relative;
    display: grid;
    place-items: center;
    flex: 0 1 var(--c-otp-cell-w);
    min-inline-size: 0;
    block-size: var(--c-otp-cell-h);
    box-sizing: border-box;
    overflow: hidden;
    /* A field's edge (`input`): a border, which stays in forced colours as
       a shadow would not. */
    border: 1px solid var(--input);
    border-radius: var(--radius-well);
    background: var(--surface-recess);
    font: var(--type-kpi);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink-stat);
    transition: color var(--dur-control) var(--ease-out);
  }
  .cell:nth-child(4) {
    margin-inline-start: calc(var(--space-5) - var(--space-2));
  }
  .glyph {
    grid-area: 1 / 1;
  }
  @media (prefers-reduced-motion: no-preference) {
    /* Type in, on the key's beat. */
    .glyph:global(.arriving) {
      animation: otp-pop var(--dur-pop) var(--ease-out)
        calc(var(--at) * var(--dur-ghost)) both;
    }
    /* Checking: the letters breathe, box by box. */
    [data-pulsing] .glyph {
      animation: otp-pulse var(--breath) var(--ease-in-out)
        calc(var(--at) * var(--dur-stagger)) infinite;
    }
    /* A dead code: box by box, each drops out of the row and fades. */
    [data-falling] .cell {
      animation: otp-fall var(--dur-settle) var(--ease-glide-in)
        calc(var(--at) * var(--dur-stagger)) both;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .glyph:global(.arriving) {
      animation: otp-fade var(--dur-fade) var(--ease-out) both;
    }
    [data-falling] .cell {
      animation: otp-fade var(--dur-fade) var(--ease-out) reverse both;
    }
  }
  @keyframes otp-pop {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise));
      filter: blur(var(--fold-blur));
    }
  }
  @keyframes otp-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    15% {
      transform: scale(var(--qr-pulse-scale));
    }
  }
  @keyframes otp-fall {
    to {
      opacity: 0;
      transform: translateY(var(--c-otp-cell-h));
    }
  }
  @keyframes otp-fade {
    from {
      opacity: 0;
    }
  }

  /* Asking the hub: the skeleton's band crossing all six as one sweep over
     the boxes' own fill and edge. */
  .band {
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(-1 * var(--x));
    inline-size: var(--c-pair-w);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .band::after {
      content: "";
      position: absolute;
      inset: 0;
      translate: -100% 0;
      background: linear-gradient(
        90deg,
        transparent 0 30%,
        var(--skeleton-sheen) 50%,
        transparent 70% 100%
      );
      animation: kit-skeleton-sweep var(--dur-loop) linear infinite paused;
    }
    [data-tone="skeleton"] .band {
      opacity: 1;
    }
    [data-tone="skeleton"] .band::after {
      animation-play-state: running;
    }
  }

  /* An answer is in the letters' ink, never the box. */
  [data-tone="done"] .cell {
    color: var(--status-done-ink);
    transition-delay: calc(var(--at) * var(--dur-stagger));
  }
  [data-tone="fail"] .cell {
    color: var(--status-fail-ink);
  }
  [data-tone="stale"] .cell {
    color: var(--ink-subtle);
    transition-duration: var(--dur-fade);
  }
  @media (prefers-reduced-motion: reduce) {
    .cell,
    [data-tone] .cell {
      transition-duration: var(--dur-fade);
      transition-delay: 0s;
    }
  }

  /* Error state shake: legs of dur-ghost, dur-ghost, dur-stagger and
     dur-stagger on one clock, each on ease-out. */
  @media (prefers-reduced-motion: no-preference) {
    .row:global(.shaking) {
      animation: otp-shake calc(var(--dur-ghost) * 2 + var(--dur-stagger) * 2)
        linear;
    }
  }
  @keyframes otp-shake {
    0% {
      transform: translateX(0);
      animation-timing-function: var(--ease-out);
    }
    28.57% {
      transform: translateX(var(--shake-distance));
      animation-timing-function: var(--ease-out);
    }
    57.14% {
      transform: translateX(calc(var(--shake-distance) * -1));
      animation-timing-function: var(--ease-out);
    }
    78.57% {
      transform: translateX(var(--shake-overshoot));
      animation-timing-function: var(--ease-out);
    }
    100% {
      transform: translateX(0);
    }
  }
</style>
