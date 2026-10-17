<script lang="ts" module>
  /**
   * How the display stands: a skeleton while the hub is asked, the code
   * while it waits, its letters in the done or fail ink once answered,
   * dimmed once it expired (stale), and boxes with nothing in them (empty).
   */
  export type OtpTone =
    "skeleton" | "code" | "done" | "fail" | "stale" | "empty";
  /** How a new code's letters arrive: popped in, or spun into place on a reel. */
  export type OtpArrival = "pop" | "reel";
</script>

<script lang="ts">
  /**
   * The pairing code as a display: six boxes in two groups of three (the
   * code's hyphen is the gap between them), each holding one letter at the
   * KPI role in the mono face, the row c-pair-w wide, the width of the QR
   * or camera above it. The display stands from the moment its screen
   * does, so a new code lands in the same boxes (round-2 design §2). It
   * reads out as one element, letter by letter.
   *
   * Every box is drawn in every state: the stat well's recess fill and a
   * 1px field edge (`input`), as an OTP field's boxes are (Trip.com,
   * GoFundMe, Polestar). An answer changes the letters' ink, never the box.
   *
   * Motion, each from its transitions-dev recipe in the house's tokens:
   * Number pop-in for a code arriving (each letter up from pop-rise and
   * sharpening from fold-blur over dur-pop, box k after k × dur-stagger);
   * Spinning counter for the reel (dur-settle, k × dur-ghost); Text states
   * swap's exit for letters leaving (up by swap-rise over dur-morph, all at
   * once); the done ink crossing the boxes k × dur-stagger apart; Error
   * state shake on the row (legs of dur-ghost, dur-ghost, dur-stagger,
   * dur-stagger). Nothing moves a box. Without motion, letters and inks
   * only fade.
   */
  import type { TransitionConfig } from "svelte/transition";
  import {
    dur,
    ease,
    easeInOut,
    easeOut,
    motionOk,
    numberOf,
  } from "../motion/curves.svelte";

  let {
    code,
    tone,
    arrive = "pop",
    shake = 0,
  }: {
    /** "JWK-HDQ", or null while there is none to show. */
    code: string | null;
    tone: OtpTone;
    arrive?: OtpArrival;
    /** Each rise replays the shake. */
    shake?: number;
  } = $props();

  const uid = $props.id();
  const CELLS = [0, 1, 2, 3, 4, 5] as const;
  const REEL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letters = $derived(code ? code.replace(/[^A-Z]/gi, "").split("") : []);
  const spoken = $derived(
    letters.length === 6
      ? `Pairing code ${letters.slice(0, 3).join(" ")}, ${letters.slice(3).join(" ")}`
      : ""
  );

  /** Mounted: letters pop or spin only for a code that arrives, never on first paint. */
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

  /** The reel: two turns of the alphabet, landing on the letter in the second. */
  const spin = (at: number, letter: string) => (strip: HTMLElement) => {
    if (!settled) {
      return;
    }
    if (!motionOk.current) {
      strip.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-fade"),
        easing: ease("--ease-out"),
      });
      return;
    }
    const cell = strip.parentElement?.clientHeight ?? 0;
    const delay = at * dur("--dur-ghost");
    const duration = dur("--dur-settle");
    strip.animate(
      [
        { transform: "translateY(0)" },
        {
          transform: `translateY(${-(REEL.length + REEL.indexOf(letter)) * cell}px)`,
        },
      ],
      { delay, duration, easing: ease("--ease-out"), fill: "backwards" }
    );
    // The streak runs along the reel only, at its fastest as the spin
    // starts and gone as it settles, the speed the curve gives it.
    const streak = strip.parentElement?.querySelector("feGaussianBlur");
    const most = numberOf("--reel-blur");
    const start = performance.now() + delay;
    const step = (time: number) => {
      const p = Math.min(1, Math.max(0, (time - start) / duration));
      streak?.setAttribute("stdDeviation", `0 ${most * (1 - easeOut(p))}`);
      if (p < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

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

<div data-slot="otp" class="otp" data-tone={tone}>
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
          {@const reeling = arrive === "reel" && !!letters[at]}
          <!-- mark-line: the svg is the reel's blur filter, drawn nowhere -->
          <span
            class={["glyph", reeling && "reel"]}
            out:leave
            {@attach arriving}
          >
            {#if reeling}
              <svg aria-hidden="true" class="streak" height="0" width="0">
                <filter id="{uid}-reel-{at}">
                  <feGaussianBlur stdDeviation="0 0" />
                </filter>
              </svg>
              <span
                style:filter="url(#{uid}-reel-{at})"
                class="strip"
                style:--stop={REEL.length + REEL.indexOf(letters[at])}
                {@attach spin(at, letters[at])}
              >
                {#each [...REEL, ...REEL] as one, place (place)}
                  <span class="letter">{one}</span>
                {/each}
              </span>
            {:else}
              {letters[at] ?? ""}
            {/if}
          </span>
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
       a shadow would not. The control edge reads 1.26:1 on the screen by
       day; a field's edge reads. */
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
  /* Number pop-in: up from pop-rise, sharpening from fold-blur, box k after
     k × dur-stagger. */
  .glyph:global(.arriving):not(.reel) {
    animation: otp-pop var(--dur-pop) var(--ease-out)
      calc(var(--at) * var(--dur-stagger)) both;
  }
  @keyframes otp-pop {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise));
      filter: blur(var(--fold-blur));
    }
  }
  /* The reel: its window (the box inside its border) a letter tall, its
     window's edges soft. */
  .reel {
    align-self: stretch;
    container-type: size;
    inline-size: 100%;
    overflow: hidden;
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 22%,
      #000 78%,
      transparent
    );
  }
  .streak {
    position: absolute;
  }
  .strip {
    display: flex;
    flex-direction: column;
    transform: translateY(calc(-1 * var(--stop) * 100cqb));
  }
  .letter {
    display: grid;
    place-items: center;
    block-size: 100cqb;
  }

  /* Asking: the skeleton's band of the raised surface crossing all six as
     one sweep (each box's band is the row's width, set back by the box's
     own place), over the box's own fill and edge. */
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

  /* An answer is in the letters' ink: approved, the done ink crossing left
     to right, box k after k × dur-stagger; refused, the fail ink at once;
     expired, subdued. */
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

  /* Error state shake: legs of dur-ghost, dur-ghost, dur-stagger and
     dur-stagger on one clock, each on ease-out. */
  .row:global(.shaking) {
    animation: otp-shake calc(var(--dur-ghost) * 2 + var(--dur-stagger) * 2)
      linear;
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
  @media (prefers-reduced-motion: reduce) {
    .row:global(.shaking) {
      animation: none;
    }
    .glyph:global(.arriving):not(.reel) {
      animation-name: otp-fade;
      animation-duration: var(--dur-fade);
      animation-delay: 0s;
    }
    .cell,
    [data-tone] .cell {
      transition-duration: var(--dur-fade);
      transition-delay: 0s;
    }
  }
  @keyframes otp-fade {
    from {
      opacity: 0;
    }
  }
</style>
