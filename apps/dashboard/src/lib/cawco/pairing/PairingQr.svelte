<script lang="ts" module>
  /**
   * What the key is doing: asked for (the skeleton), arriving, waiting to
   * be scanned, stepped back while the person checks, swallowed (approved),
   * flown up to Caw (approved, the other take), burst (denied) or drained
   * (expired).
   */
  export type QrAct =
    | "loading"
    | "still"
    | "arrive"
    | "wait"
    | "dim"
    | "swallow"
    | "fly"
    | "burst"
    | "drain";
  /** How the waiting key shows life: a light round its edge, or ripples from Caw. */
  export type QrWait = "sweep" | "ripple";
  /** The head on the code's middle: swapped by key, cross-faded. */
  export interface QrCentre {
    key: string;
    src: string;
  }
</script>

<script lang="ts">
  import type { TransitionConfig } from "svelte/transition";
  /**
   * The key: the pairing code as a QR a paired iPhone or iPad scans. A
   * square card c-pair-w wide, the width of the code's six boxes under it.
   * uqr's matrix at error correction level H, so a head (`centre`, the app
   * icon's Caw by default) stands in its middle: each dark module a dot,
   * the three finder eyes a rounded ring round a dot, two modules of quiet
   * zone inside the card's padding, dark on qr-paper in both schemes.
   *
   * ANIMATION STORYBOARD (each act a CSS animation on transform and
   * opacity, on the page's clock; every dot carries its own seeded numbers)
   *
   *   arrive   every dot from a scattered start, shuffling twice, then
   *            locking on its module over dur-settle, its own share of
   *            dur-panel late: the key reads the instant it settles
   *   wait     sweep: a lit segment travels the card's rounded edge once a
   *            breath, and one light rides the edge with it (a motion
   *            path), screened over the key so the dots it crosses glint
   *            ripple: the head breathes and one ring screens out from it
   *            warm: the light takes the warn ink (the last minute)
   *   dim      the code steps back to qr-dim-opacity, the edge gone
   *   swallow  every dot pours into the head, inner first, over dur-pop
   *            on ease-in-out, and the head gulps once
   *   fly      the whole card rises toward Caw and shrinks away
   *   burst    every dot bursts out from the head, then falls on the
   *            gravity curve; the head squeezes and shakes once
   *   drain    the dots go from the edges inward, each shrinking away
   *
   * Without motion every act is a fade, and the edge holds still, lit.
   */
  import { encode, QrCodeDataType } from "uqr";
  import cawIcon from "#lib/assets/brand/caw-app-icon.png";
  import { dur, easeOut } from "../motion/curves.svelte";

  let {
    payload,
    act,
    wait = "sweep",
    warm = false,
    centre = { key: "caw", src: cawIcon },
  }: {
    /**
     * What it carries: the pairing's RFC 8628 `verification_uri_complete`
     * (core `PairingStart`), the hub and the code in its query. Null while
     * there is none.
     */
    payload: string | null;
    act: QrAct;
    wait?: QrWait;
    /** The last minute: the waiting light warms. */
    warm?: boolean;
    centre?: QrCentre;
  } = $props();

  /** Modules of quiet zone inside the card's padding. */
  const QUIET = 2;
  /** Caw's tile, as a share of the symbol's side. */
  const LOGO_SHARE = 0.22;
  /** How far a scattered dot starts from its module, in modules. */
  const SCATTER = 6;
  /** How far a bursting dot flies before it falls, as a share of its way from the head. */
  const BURST = 0.6;
  /** How far a falling dot drops before it is gone, in modules. */
  const FALL = 8;

  const matrix = $derived(
    payload ? encode(payload, { ecc: "H", border: 0 }) : null
  );
  const side = $derived(matrix?.size ?? 0);
  /** The tile's side in modules: odd, so it centres on a module. */
  const logo = $derived.by(() => {
    const near = Math.round(side * LOGO_SHARE);
    return near % 2 === 0 ? near + 1 : near;
  });

  /**
   * One dot: its module, and the numbers its acts read, written as one
   * style (a write a dot, not one a number): --dx/--dy its scattered start
   * and --bx/--by its way to the head (modules), --far its distance from
   * the head and --r its own random number (0 to 1).
   */
  interface Dot {
    style: string;
    x: number;
    y: number;
  }

  /**
   * The same scatter for the same code: a linear congruential generator
   * (Numerical Recipes' constants) seeded from the text, in plain
   * arithmetic: every value stays an exact integer below 2^53.
   */
  const MODULUS = 2 ** 32;
  function seeded(text: string): () => number {
    let seed = 0;
    for (const char of text) {
      seed = (seed * 31 + (char.codePointAt(0) ?? 0)) % MODULUS;
    }
    return () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % MODULUS;
      return seed / MODULUS;
    };
  }

  const drawing = $derived.by(() => {
    if (!(matrix && payload)) {
      return { dots: [] as Dot[], eyes: [] as { x: number; y: number }[] };
    }
    const random = seeded(payload);
    const middle = (side - 1) / 2;
    const reach = Math.hypot(middle, middle);
    // The tile and half a module round it are kept clear of modules.
    const clear = logo / 2 + 0.5;
    const dots: Dot[] = [];
    for (const [y, row] of matrix.data.entries()) {
      for (const [x, dark] of row.entries()) {
        if (
          !dark ||
          matrix.types[y]?.[x] === QrCodeDataType.Position ||
          (Math.abs(x - middle) < clear && Math.abs(y - middle) < clear)
        ) {
          continue;
        }
        // A start inside the symbol, so no dot is ever drawn past it.
        const dx = Math.max(
          -x,
          Math.min(side - 1 - x, (random() * 2 - 1) * SCATTER)
        );
        const dy = Math.max(
          -y,
          Math.min(side - 1 - y, (random() * 2 - 1) * SCATTER)
        );
        dots.push({
          x,
          y,
          style: `--dx:${dx};--dy:${dy};--bx:${middle - x};--by:${middle - y};--far:${Math.hypot(x - middle, y - middle) / reach};--r:${random()}`,
        });
      }
    }
    const far = side - 7;
    return {
      dots,
      eyes: [
        { x: 0, y: 0 },
        { x: far, y: 0 },
        { x: 0, y: far },
      ],
    };
  });

  /** The head's swap: the new one fades in over the old, in one place. */
  const swap = (_node: Element): TransitionConfig => ({
    duration: dur("--dur-fade"),
    easing: easeOut,
    css: (t) => `opacity: ${t}`,
  });
</script>

<div
  data-slot="qr"
  class="qr"
  data-act={act}
  data-breathe={(act === "wait" && wait === "ripple") || undefined}
  data-wait={wait}
  data-warm={warm || undefined}
>
  <div class="card">
    <div class="field">
      <span class="skeleton kit-skeleton"></span>
      {#if matrix}
        <svg
          style:--fall={FALL}
          style:--burst={BURST}
          class="code"
          aria-label="Pairing QR code"
          role="img"
          viewBox="{-QUIET} {-QUIET} {side + QUIET * 2} {side + QUIET * 2}"
        >
          {#each drawing.dots as dot (`${dot.x},${dot.y}`)}
            <circle
              style={dot.style}
              class="dot"
              cx={dot.x + 0.5}
              cy={dot.y + 0.5}
              r="0.42"
            />
          {/each}
          {#each drawing.eyes as eye (`${eye.x},${eye.y}`)}
            <g
              style:--bx={(side - 1) / 2 - (eye.x + 3)}
              style:--by={(side - 1) / 2 - (eye.y + 3)}
              style:--far={1}
              style:--r={0.5}
              class="eye"
            >
              <rect
                fill="none"
                height="6"
                rx="1.9"
                stroke="currentColor"
                stroke-width="1"
                width="6"
                x={eye.x + 0.5}
                y={eye.y + 0.5}
              />
              <circle
                cx={eye.x + 3.5}
                cy={eye.y + 3.5}
                fill="currentColor"
                r="1.5"
              />
            </g>
          {/each}
        </svg>
      {/if}
      <span
        style:--logo={side > 0 ? logo / (side + QUIET * 2) : LOGO_SHARE}
        class="tile"
      >
        {#key centre.key}
          <img class="head" alt="" in:swap out:swap src={centre.src} />
        {/key}
      </span>
    </div>
    {#if act === "wait" && wait === "sweep"}
      <svg aria-hidden="true" class="edge">
        <rect class="lit" height="100%" pathLength="100" width="100%" />
      </svg>
      <!-- One light riding the edge with the segment: what it crosses glints. -->
      <span aria-hidden="true" class="glint"></span>
    {:else if act === "wait" && wait === "ripple"}
      <!-- One ring out from the head: what it crosses glints. -->
      <span aria-hidden="true" class="ripple"></span>
    {/if}
  </div>
</div>

<style>
  /* A definite track: the card's 100% is of the place it is given, never of
     its own width. */
  .qr {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    inline-size: 100%;
  }
  .card {
    position: relative;
    box-sizing: border-box;
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
    aspect-ratio: 1;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--qr-paper);
    box-shadow: var(--shadow-tile);
    color: var(--qr-ink);
  }
  .field {
    position: relative;
    display: grid;
    inline-size: 100%;
    block-size: 100%;
  }
  .skeleton,
  .code {
    grid-area: 1 / 1;
    inline-size: 100%;
    block-size: 100%;
    transition:
      opacity var(--dur-pop) var(--ease-in-out),
      filter var(--dur-pop) var(--ease-in-out);
  }
  /* Nested in the card: the card's radius less its padding. */
  .skeleton {
    border-radius: max(0px, calc(var(--radius-lg) - var(--space-3)));
  }
  .code {
    display: block;
  }
  .dot,
  .eye {
    transform-box: fill-box;
    transform-origin: center;
  }
  .dot {
    fill: currentColor;
  }
  .tile {
    display: grid;
    grid-area: 1 / 1;
    place-self: center;
    inline-size: calc(100% * var(--logo));
    aspect-ratio: 1;
  }
  .head {
    grid-area: 1 / 1;
    inline-size: 100%;
    block-size: 100%;
    border-radius: 22%;
    object-fit: cover;
  }
  [data-act="loading"] .code {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }
  .qr:not([data-act="loading"]) .skeleton {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }
  [data-act="dim"] .code {
    opacity: var(--qr-dim-opacity);
  }

  @media (prefers-reduced-motion: no-preference) {
    /* arrive: from a scattered start, shuffling twice, locking. */
    [data-act="arrive"] .dot {
      animation: qr-shuffle var(--dur-settle) var(--ease-in-out)
        calc(var(--r) * var(--dur-panel)) both;
    }
    [data-act="arrive"] .eye {
      animation: qr-eye var(--dur-pop) var(--ease-out) var(--dur-settle) both;
    }
    /* wait: the light rides the card's rounded edge with the segment (a
       motion path, composited), lighting the dots it crosses. */
    .glint {
      animation: qr-ride var(--breath) linear infinite;
    }
    /* ripple: a ring out from the head, which breathes as it leaves. */
    .ripple {
      animation: qr-ring var(--breath) var(--ease-out) infinite;
    }
    [data-breathe] .tile {
      animation: qr-breathe var(--breath) var(--ease-in-out) infinite;
    }
    /* swallow: the key pours into the head, inner dots first; the head gulps. */
    [data-act="swallow"] .dot,
    [data-act="swallow"] .eye {
      animation: qr-swallow var(--dur-pop) var(--ease-in-out)
        calc(var(--far) * var(--dur-panel)) both;
    }
    [data-act="swallow"] .tile {
      animation: qr-gulp var(--dur-pop) var(--ease-out)
        calc(var(--dur-panel) + var(--dur-pop)) both;
    }
    /* fly: the whole key rises toward Caw and shrinks away. */
    [data-act="fly"] .card {
      animation: qr-fly var(--dur-settle) var(--ease-in-out) both;
    }
    /* burst: out from the head, then down on the gravity curve. */
    [data-act="burst"] .dot,
    [data-act="burst"] .eye {
      animation: qr-burst var(--dur-settle) linear
        calc(var(--r) * var(--dur-ghost)) both;
    }
    [data-act="burst"] .tile {
      animation:
        qr-squeeze var(--dur-panel) var(--ease-out) both,
        qr-shake calc(var(--dur-ghost) * 2 + var(--dur-stagger) * 2) linear
          var(--dur-panel);
    }
    /* drain: from the edges inward, each dot shrinking away. */
    [data-act="drain"] .dot,
    [data-act="drain"] .eye {
      animation: qr-drain var(--dur-pop) var(--ease-out)
        calc((1 - var(--far)) * var(--dur-panel)) both;
    }
    [data-act="drain"] .tile {
      animation: qr-drain var(--dur-pop) var(--ease-out) var(--dur-panel) both;
    }
  }
  /* Without motion every leaving act is a fade. */
  @media (prefers-reduced-motion: reduce) {
    :is(
        [data-act="swallow"],
        [data-act="fly"],
        [data-act="burst"],
        [data-act="drain"]
      )
      .field {
      opacity: 0;
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
  @keyframes qr-shuffle {
    0% {
      opacity: 0;
      transform: translate(calc(var(--dx) * 1px), calc(var(--dy) * 1px));
    }
    35% {
      opacity: 1;
      transform: translate(calc(var(--dy) * -0.5px), calc(var(--dx) * 0.5px));
    }
    70% {
      opacity: 0.6;
      transform: translate(calc(var(--dx) * -0.2px), calc(var(--dy) * 0.2px));
    }
  }
  @keyframes qr-eye {
    from {
      opacity: 0;
      transform: scale(var(--pop-scale));
    }
  }
  /* The glint and the ring: brand light screened over the key, so the dark
     dots they cross light up and the paper stays paper. One element each,
     transform and opacity only. */
  .glint,
  .ripple {
    position: absolute;
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: var(--qr-glint-opacity);
  }
  .glint {
    inset-block-start: 0;
    inset-inline-start: 0;
    inline-size: calc(var(--c-pair-w) * var(--qr-edge-share) * 2);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--brand-solid), transparent);
    offset-path: inset(0 round var(--radius-lg));
    offset-rotate: 0deg;
  }
  [data-warm] .glint {
    background: radial-gradient(closest-side, var(--data-warn), transparent);
  }
  .ripple {
    inset: 0;
    margin: auto;
    inline-size: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
      closest-side,
      transparent 72%,
      var(--brand-solid) 86%,
      transparent
    );
    transform: scale(0);
  }
  @keyframes qr-ride {
    from {
      offset-distance: 0%;
    }
    to {
      offset-distance: 100%;
    }
  }
  @keyframes qr-ring {
    from {
      opacity: var(--qr-glint-opacity);
      transform: scale(var(--qr-shrink));
    }
    to {
      opacity: 0;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .glint,
    .ripple {
      display: none;
    }
  }
  @keyframes qr-breathe {
    0%,
    100% {
      transform: scale(1);
    }
    8% {
      transform: scale(var(--qr-pulse-scale));
    }
  }
  @keyframes qr-swallow {
    to {
      opacity: 0;
      transform: translate(calc(var(--bx) * 1px), calc(var(--by) * 1px))
        scale(var(--pop-scale));
    }
  }
  @keyframes qr-gulp {
    50% {
      transform: scale(var(--qr-pulse-scale));
    }
  }
  @keyframes qr-fly {
    to {
      opacity: 0;
      transform: translateY(-50%) scale(var(--qr-shrink));
    }
  }
  @keyframes qr-burst {
    0% {
      animation-timing-function: var(--ease-out);
    }
    35% {
      opacity: 1;
      transform: translate(
        calc(var(--bx) * var(--burst) * -1px),
        calc(var(--by) * var(--burst) * -1px)
      );
      animation-timing-function: var(--ease-glide-in);
    }
    100% {
      opacity: 0;
      transform: translate(
        calc(var(--bx) * var(--burst) * -1px),
        calc((var(--fall) - var(--by) * var(--burst)) * 1px)
      );
    }
  }
  @keyframes qr-squeeze {
    40% {
      transform: scale(calc(2 - var(--qr-squeeze)), var(--qr-squeeze));
    }
  }
  @keyframes qr-shake {
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
  @keyframes qr-drain {
    to {
      opacity: 0;
      transform: scale(var(--qr-shrink));
    }
  }

  /* Waiting to be scanned: a lit segment travels the card's own rounded
     edge (its radius, its box), once a breath; warm in the last minute. */
  .edge {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .lit {
    fill: none;
    stroke: var(--brand-solid);
    stroke-width: var(--c-corner-grip-stroke);
    stroke-linecap: round;
    rx: var(--radius-lg);
    stroke-dasharray: calc(var(--qr-edge-share) * 100) 100;
    transition: stroke var(--dur-panel) var(--ease-out);
  }
  [data-warm] .lit {
    stroke: var(--data-warn);
  }
  @media (prefers-reduced-motion: no-preference) {
    .lit {
      animation: qr-edge var(--breath) linear infinite;
    }
  }
  /* Without motion the whole edge holds, lit. */
  @media (prefers-reduced-motion: reduce) {
    .lit {
      stroke-dasharray: none;
    }
  }
  @keyframes qr-edge {
    to {
      stroke-dashoffset: -100;
    }
  }
</style>
