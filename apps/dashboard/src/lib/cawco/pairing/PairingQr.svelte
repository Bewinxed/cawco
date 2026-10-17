<script lang="ts" module>
  /** Where the QR stands: asked for, scannable, or no longer scannable. */
  export type QrState = "loading" | "code" | "gone";
</script>

<script lang="ts">
  /**
   * The pairing screen's picture: the code as a QR, for a paired iPhone or
   * iPad to scan instead of reading it (round-2 design §1). A square card
   * c-pair-w wide, the code's cells' width, so its edges stand on theirs.
   *
   * Drawn from uqr's module matrix at error correction level H (a third of
   * the symbol can be lost and still read), so Caw's head from the app icon
   * stands in its middle as Brave's lion does: data modules as dots, the
   * three finder eyes as a rounded ring round a dot, two modules of quiet
   * zone inside the card's space-3 padding. Dark modules on a light card in
   * both schemes (qr-paper, qr-ink; round-2 design §6: a reversed code at
   * night was not read by a reader with no inverted pass).
   *
   * Skeleton loader and reveal (transitions-dev): asking, the field is the
   * skeleton; the code arriving, the two cross-fade and cross-blur in the
   * same place over dur-pop on ease-in-out, nothing moving. No longer
   * scannable (denied, expired), the code fades over dur-exit to
   * qr-void-opacity, still a code, the card and Caw standing. The card
   * never changes size.
   */
  import { encode, QrCodeDataType } from "uqr";
  import cawIcon from "#lib/assets/brand/caw-app-icon.png";

  let {
    payload,
    state,
  }: {
    /**
     * What it carries: the pairing's RFC 8628 `verification_uri_complete`
     * (core `PairingStart`), the hub and the code in its query, so a scan
     * names one waiting request on one hub. Null while there is none.
     */
    payload: string | null;
    state: QrState;
  } = $props();

  /** Modules of quiet zone inside the card's padding. */
  const QUIET = 2;
  /** Caw's tile, as a share of the symbol's side. */
  const LOGO_SHARE = 0.22;

  const matrix = $derived(
    payload ? encode(payload, { ecc: "H", border: 0 }) : null
  );
  const side = $derived(matrix?.size ?? 0);
  /** The tile's side in modules: odd, so it centres on a module. */
  const logo = $derived.by(() => {
    const near = Math.round(side * LOGO_SHARE);
    return near % 2 === 0 ? near + 1 : near;
  });

  const drawing = $derived.by(() => {
    if (!matrix) {
      return { dots: "", eyes: [] as { x: number; y: number }[] };
    }
    const centre = side / 2;
    // The tile and half a module round it are kept clear of modules.
    const clear = logo / 2 + 0.5;
    let dots = "";
    for (const [y, row] of matrix.data.entries()) {
      for (const [x, dark] of row.entries()) {
        if (
          !dark ||
          matrix.types[y]?.[x] === QrCodeDataType.Position ||
          (Math.abs(x + 0.5 - centre) < clear &&
            Math.abs(y + 0.5 - centre) < clear)
        ) {
          continue;
        }
        // A dot of radius 0.42 on the module's centre, as two half arcs.
        dots += `M${x + 0.08} ${y + 0.5}a.42 .42 0 1 0 .84 0a.42 .42 0 1 0 -.84 0z`;
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
</script>

<div data-slot="qr" class="qr" data-state={state}>
  <div class="card">
    <div class="field">
      <span class="skeleton kit-skeleton"></span>
      {#if matrix}
        <svg
          class="code"
          aria-label="Pairing QR code"
          role="img"
          viewBox="{-QUIET} {-QUIET} {side + QUIET * 2} {side + QUIET * 2}"
        >
          <path d={drawing.dots} fill="currentColor" />
          {#each drawing.eyes as eye (`${eye.x},${eye.y}`)}
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
          {/each}
        </svg>
      {/if}
      <img
        style:--logo={side > 0 ? logo / (side + QUIET * 2) : LOGO_SHARE}
        class="logo"
        alt=""
        src={cawIcon}
      />
    </div>
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
  /* Caw's head, centred on the symbol, its tile rounded as the app icon is. */
  .logo {
    grid-area: 1 / 1;
    place-self: center;
    inline-size: calc(100% * var(--logo));
    aspect-ratio: 1;
    border-radius: 22%;
    object-fit: cover;
  }
  [data-state="loading"] .code {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }
  [data-state="code"] .skeleton,
  [data-state="gone"] .skeleton {
    opacity: 0;
    filter: blur(var(--fold-blur));
  }
  [data-state="gone"] .code {
    opacity: var(--qr-void-opacity);
    transition-duration: var(--dur-exit);
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton,
    .code {
      filter: none !important;
    }
  }
</style>
