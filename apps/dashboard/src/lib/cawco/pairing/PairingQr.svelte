<script lang="ts" module>
  /**
   * Where the QR stands: asked for (the skeleton), scannable, dissolving
   * (approved: it worked, it goes), or falling apart (a dead code).
   */
  export type QrState = "loading" | "code" | "dissolve" | "fall";
  /** How the code's dots come together as it arrives (the owner's pick). */
  export type QrArrival = "scatter" | "flicker" | "bloom";
  /** How the card says the code waits to be scanned (the owner's pick). */
  export type QrPending = "edge" | "edge-pulse";
  /** The head on the code's middle: swapped by key, cross-faded. */
  export interface QrCentre {
    key: string;
    src: string;
  }
</script>

<script lang="ts">
  /**
   * The pairing screen's picture: the code as a QR, for a paired iPhone or
   * iPad to scan instead of reading it (round-2 design §1). A square card
   * c-pair-w wide, the code's cells' width, so its edges stand on theirs.
   *
   * Drawn from uqr's module matrix at error correction level H, so a head
   * (`centre`, the app icon's Caw by default) stands in its middle as
   * Brave's lion does: each dark module a dot, the three finder eyes a
   * rounded ring round a dot, two modules of quiet zone inside the card's
   * padding. Dark modules on a light card in both schemes (qr-paper,
   * qr-ink; round-2 design §6).
   *
   * Every dot is its own element with its own seeded numbers, so the code
   * arrives as its dots come together (`arrival`: scattered and
   * converging, flickering and locking row by row, or blooming out from the
   * middle) and lands exactly on its modules: it reads the moment it
   * settles. Approved, it dissolves (the arrival, run back at exit speed);
   * dead, it falls apart, each dot dropping and fading on the house's
   * gravity curve (ease-glide-in) out of the symbol's frame. Transform and
   * opacity only, on CSS animations the page's clock can pause and seek.
   * While the code waits (`pending`), a lit segment travels the card's own
   * rounded edge once a breath, and in one take a ring breathes out from
   * it. Without motion: the code fades, and the edge holds still, lit.
   */
  import { encode, QrCodeDataType } from "uqr";
  import type { TransitionConfig } from "svelte/transition";
  import cawIcon from "#lib/assets/brand/caw-app-icon.png";
  import { dur, easeOut } from "../motion/curves.svelte";

  let {
    payload,
    state,
    arrival = "scatter",
    pending = null,
    centre = { key: "caw", src: cawIcon },
  }: {
    /**
     * What it carries: the pairing's RFC 8628 `verification_uri_complete`
     * (core `PairingStart`), the hub and the code in its query. Null while
     * there is none.
     */
    payload: string | null;
    state: QrState;
    arrival?: QrArrival;
    /** The waiting code's edge, or null once it no longer waits. */
    pending?: QrPending | null;
    centre?: QrCentre;
  } = $props();

  /** Modules of quiet zone inside the card's padding. */
  const QUIET = 2;
  /** Caw's tile, as a share of the symbol's side. */
  const LOGO_SHARE = 0.22;
  /** How far a scattered dot starts from its module, in modules. */
  const SCATTER = 6;
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

  /** One dot: its module, and the numbers its motion reads. */
  interface Dot {
    /** Toward the middle, in modules (bloom). */
    bx: number;
    by: number;
    /** Its scattered start, in modules (scatter). */
    dx: number;
    dy: number;
    /** Its distance from the middle, 0 to 1. */
    far: number;
    /** Its own random number, 0 to 1. */
    r: number;
    /** Its row, top to bottom, 0 to 1. */
    row: number;
    x: number;
    y: number;
  }

  /** The same scatter for the same code: a small seeded generator (mulberry32). */
  function seeded(text: string): () => number {
    let seed = 0;
    for (const char of text) {
      seed = Math.imul(seed ^ char.charCodeAt(0), 2_654_435_761);
    }
    return () => {
      seed = (seed + 0x6d_2b_79_f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
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
          dx,
          dy,
          bx: middle - x,
          by: middle - y,
          far: Math.hypot(x - middle, y - middle) / reach,
          r: random(),
          row: y / Math.max(1, side - 1),
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

  /** Mounted: a code that arrives comes together; the first one stands. */
  let settled = false;
  $effect(() => {
    settled = true;
  });
  const arriving = (svg: SVGSVGElement) => {
    if (settled) {
      svg.setAttribute("data-arrive", "");
    }
  };

  /** The head's swap: the new one fades in over the old, in one place. */
  const swap = (_node: Element): TransitionConfig => ({
    duration: dur("--dur-fade"),
    easing: easeOut,
    css: (t) => `opacity: ${t}`,
  });
</script>

<div data-slot="qr" class="qr" data-state={state}>
  <div class="card">
    <div class="field">
      <span class="skeleton kit-skeleton"></span>
      {#if matrix}
        <svg
          style:--fall={FALL}
          class="code"
          aria-label="Pairing QR code"
          data-arrival={arrival}
          role="img"
          viewBox="{-QUIET} {-QUIET} {side + QUIET * 2} {side + QUIET * 2}"
          {@attach arriving}
        >
          {#each drawing.dots as dot (`${dot.x},${dot.y}`)}
            <circle
              style:--dx={dot.dx}
              style:--dy={dot.dy}
              style:--bx={dot.bx}
              style:--by={dot.by}
              style:--far={dot.far}
              style:--r={dot.r}
              style:--row={dot.row}
              class="dot"
              cx={dot.x + 0.5}
              cy={dot.y + 0.5}
              r="0.42"
            />
          {/each}
          {#each drawing.eyes as eye (`${eye.x},${eye.y}`)}
            <g class="eye">
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
    {#if pending}
      <svg aria-hidden="true" class="edge">
        <rect class="lit" height="100%" pathLength="100" width="100%" />
      </svg>
      {#if pending === "edge-pulse"}
        <span aria-hidden="true" class="pulse"></span>
      {/if}
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
  /* Square, c-pair-w wide like the cells under it, its padding the outer
     quiet zone. Dark modules on a light card in both schemes. */
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
  .dot {
    fill: currentColor;
    transform-box: fill-box;
    transform-origin: center;
  }
  /* The head, centred on the symbol, its tile rounded as the app icon is. */
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
  [data-state="loading"] .code {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }
  [data-state="code"] .skeleton,
  [data-state="dissolve"] .skeleton,
  [data-state="fall"] .skeleton {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }

  /* The code's arrival (Skeleton reveal's content side), each take landing
     on the modules: */
  @media (prefers-reduced-motion: no-preference) {
    /* Scattered: every dot from its own start inside the symbol, home over
       dur-settle, its own share of dur-panel late. */
    .code:global([data-arrive])[data-arrival="scatter"] .dot {
      animation: qr-scatter var(--dur-settle) var(--ease-out)
        calc(var(--r) * var(--dur-panel)) both;
    }
    /* Flickering: each dot on and off at random, the rows locking top to
       bottom across dur-cascade. */
    .code:global([data-arrive])[data-arrival="flicker"] .dot {
      animation: qr-flicker var(--dur-settle) step-end
        calc(var(--row) * var(--dur-cascade) + var(--r) * var(--dur-ghost)) both;
    }
    /* Blooming: from the middle outward, each dot out of the centre. */
    .code:global([data-arrive])[data-arrival="bloom"] .dot {
      animation: qr-bloom var(--dur-pop) var(--ease-out)
        calc(var(--far) * var(--dur-panel)) both;
    }
    .code:global([data-arrive]) .eye {
      transform-box: fill-box;
      transform-origin: center;
      animation: qr-eye var(--dur-pop) var(--ease-out) var(--dur-panel) both;
    }
    /* Approved: the arrival run back, at exit speed. */
    [data-state="dissolve"] .code[data-arrival="scatter"] .dot {
      animation: qr-scatter var(--dur-exit) var(--ease-out)
        calc(var(--r) * var(--dur-exit)) reverse both;
    }
    [data-state="dissolve"] .code[data-arrival="flicker"] .dot {
      animation: qr-flicker var(--dur-exit) step-end
        calc(var(--row) * var(--dur-exit)) reverse both;
    }
    [data-state="dissolve"] .code[data-arrival="bloom"] .dot {
      animation: qr-bloom var(--dur-exit) var(--ease-out)
        calc(var(--far) * var(--dur-exit)) reverse both;
    }
    [data-state="dissolve"] .eye {
      transform-box: fill-box;
      transform-origin: center;
      animation: qr-eye var(--dur-exit) var(--ease-out) reverse both;
    }
    /* Dead: every dot drops out of the symbol on the gravity curve, fading,
       its own share of dur-panel late. */
    [data-state="fall"] .dot,
    [data-state="fall"] .eye {
      animation: qr-fall var(--dur-settle) var(--ease-glide-in)
        calc(var(--r, 0.5) * var(--dur-panel)) both;
    }
  }
  [data-state="dissolve"] .code,
  [data-state="fall"] .code {
    transition-duration: var(--dur-settle);
  }
  @keyframes qr-scatter {
    from {
      opacity: 0;
      transform: translate(calc(var(--dx) * 1px), calc(var(--dy) * 1px));
    }
  }
  @keyframes qr-flicker {
    0% {
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    35% {
      opacity: 0;
    }
    55% {
      opacity: 1;
    }
    70% {
      opacity: 0;
    }
    85%,
    100% {
      opacity: 1;
    }
  }
  @keyframes qr-bloom {
    from {
      opacity: 0;
      transform: translate(calc(var(--bx) * 1px), calc(var(--by) * 1px))
        scale(var(--pop-scale));
    }
  }
  @keyframes qr-eye {
    from {
      opacity: 0;
      transform: scale(var(--pop-scale));
    }
  }
  @keyframes qr-fall {
    to {
      opacity: 0;
      transform: translateY(calc(var(--fall) * 1px));
    }
  }
  /* Without motion the code only fades in and out. */
  @media (prefers-reduced-motion: reduce) {
    [data-state="dissolve"] .code,
    [data-state="fall"] .code {
      opacity: 0;
    }
  }

  /* Waiting to be scanned: a lit segment travels the card's own rounded
     edge (its radius, its box), once a breath. */
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
  }
  .pulse {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: 0 0 0 var(--c-corner-grip-stroke) var(--brand-solid);
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .lit {
      animation: qr-edge var(--breath) linear infinite;
    }
    .pulse {
      animation: qr-pulse var(--breath) var(--ease-out) infinite;
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
  @keyframes qr-pulse {
    from {
      opacity: 0.6;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(var(--qr-pulse-scale));
    }
  }
</style>
