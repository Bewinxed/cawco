<script lang="ts">
  /**
   * The top bar's trailing glass group (Shell `.tools`), with Files as one
   * more of its items, leading it: Files, Jump, the machines, then Caw at
   * the edge. Every item is the group's one recipe (Shell `.bar-item`: a
   * 28px borderless item on the glass, its 20px `.bar-symbol` in the muted
   * ink, the hover step, the press tint), restated here because Shell's
   * rules are its own; the machines keep MachinesButton's number and pad,
   * Caw his capsule (NeedsCaw) with his still and rim from the day capture.
   *
   * The count, two ways (`count`):
   * - `mark`: a small vermillion mark centred on the glyph's top-trailing
   *   corner, so it covers that corner and none of the folder's body: the
   *   work tab's count (a solid fill, its numeral's ink, `radius-xs`,
   *   tabular figures) in the chosen chip's vermillion and white, at the
   *   caps role, the type scale's smallest, and a `space-1` pad;
   * - `none`: no mark; the count is in the item's name ("Files, 20") and in
   *   the panel's own heads.
   *
   * On a phone (`phone`) the group is Shell's phone glass: Jump and the
   * machines are in the sidebar, so it holds Files and Caw.
   */
  import IconToolFiles from "~icons/solar/folder-with-files-bold-duotone";
  import IconSearch from "~icons/solar/magnifer-bold-duotone";
  import IconServer from "~icons/solar/server-2-bold-duotone";
  import cawHead from "./assets/caw-head.png";

  let {
    count,
    open = false,
    joined = false,
    mark = false,
    phone = false,
    onfiles,
    group = $bindable(null),
  }: {
    count: number;
    /** Files' card is asked open. */
    open?: boolean;
    /** The glass's card stands drawn out of the glass: the glass draws its join. */
    joined?: boolean;
    mark?: boolean;
    /** The phone's glass, tucked into the screen's trailing edge. */
    phone?: boolean;
    /** Files pressed. */
    onfiles?: () => void;
    /** The group's element, which the glass's card hangs from. */
    group?: HTMLElement | null;
  } = $props();
</script>

<div
  bind:this={group}
  class="tools"
  data-bar-group
  data-joined={joined ? "" : undefined}
  data-phone={phone ? "" : undefined}
>
  <!-- The glass as one shape with the card hanging from it while one does
       (Shell `.join`). -->
  <span aria-hidden="true" class="join" data-slot="join"></span>
  <button
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={count > 0 ? `Files, ${count}` : "Files"}
    class="bar-item files touch-hit press-tint"
    data-bar-item="files"
    data-files-control
    onclick={onfiles}
    title={count > 0 ? `Files, ${count}` : "Files"}
    type="button"
  >
    <span class="glyph-box" data-box>
      <IconToolFiles aria-hidden="true" class="bar-symbol" />
      {#if mark && count > 0}
        <span aria-hidden="true" class="count-mark num" data-count-mark
          >{count}</span
        >
      {/if}
    </span>
  </button>
  <button
    aria-label="Jump to session"
    class="bar-item touch-hit press-tint"
    data-bar-item="jump"
    title="Jump to session (⌘K)"
    type="button"
  >
    <IconSearch aria-hidden="true" class="bar-symbol" />
  </button>
  <button
    aria-label="2 machines"
    class="bar-item machines mark-line touch-hit press-tint"
    data-bar-item="machines"
    title="Machines"
    type="button"
  >
    <IconServer aria-hidden="true" class="bar-symbol" />
    <span class="num machines-num">2</span>
  </button>
  <button
    aria-label="Needs you, 2"
    class="capsule bar-item touch-hit press-tint"
    data-bar-item="caw"
    title="2 need you"
    type="button"
  >
    <img alt="" class="caw" src={cawHead} />
  </button>
</div>

<style>
  /* Shell `.tools`: the one glass capsule on the bar's control height,
     its items concentric inside it. */
  .tools {
    --hit-gap-x: var(--c-bar-group-pad);
    /* How far the glass's leading foot flares out into the card hanging
       from it (`.join`, HangCard reads it): the card's own corner radius. */
    --flare: var(--radius-lg);
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--c-bar-group-pad);
    block-size: var(--c-btn-h);
    padding: var(--c-bar-group-pad);
    border-radius: var(--radius-pill);
    box-sizing: border-box;

    @media (pointer: coarse) {
      --hit-gap-x: 16px;
      gap: 16px;
    }
  }
  .tools::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--border-hairline);
    border-radius: inherit;
    background: var(--material-panel);
    box-shadow: var(--shadow-tile);
    backdrop-filter: blur(calc(var(--material-blur) * 1.4))
      saturate(var(--material-saturate));
    pointer-events: none;

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      backdrop-filter: none;
      border-color: var(--border-contrast);
    }
  }
  /* Shell `.join`: while a card hangs from the glass, the glass is one
     shape with it, its top corners the glass's round, its trailing flank
     running straight down into the card's side, its leading one flaring out
     at its foot into the card's top edge (`--flare`), its foot no edge at
     all; the edge's ink in the layer, the surface 1px inside it. It fades in
     as the card grows and out as it folds (`data-joined`). */
  .join {
    --f: var(--flare);
    --r: calc(var(--c-btn-h) / 2);
    --h: calc(100% - 1px);
    position: absolute;
    inset-block: 0 -1px;
    inset-inline: calc(-1 * var(--f)) 0;
    pointer-events: none;
    opacity: 0;
    background: var(--border-control);
    clip-path: shape(
      from 0 var(--h),
      arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw,
      line to var(--f) var(--r),
      arc to calc(var(--f) + var(--r)) 0 of var(--r) cw,
      line to calc(100% - var(--r)) 0,
      arc to 100% var(--r) of var(--r) cw,
      line to 100% 100%,
      line to 0 100%,
      close
    );
    transition: opacity var(--dur-exit) var(--ease-out);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--surface-raised);
      clip-path: shape(
        from 0 100%,
        arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
          calc(var(--f) + 1px) ccw,
        line to calc(var(--f) + 1px) var(--r),
        arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
        line to calc(100% - var(--r)) 1px,
        arc to calc(100% - 1px) var(--r) of calc(var(--r) - 1px) cw,
        line to calc(100% - 1px) 100%,
        close
      );
    }
  }
  .tools[data-joined] .join {
    opacity: 1;
    transition-duration: var(--dur-pop);
  }
  /* Shell `.bar-item` and `.bar-symbol`. */
  .bar-item {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--c-bar-item);
    block-size: var(--c-bar-item);
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--ink-strong);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .tools :global(.bar-symbol) {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .bar-item:hover {
      background: var(--surface-hover);
    }
  }
  /* Files floating open: its item holds the tint. */
  .files[aria-expanded="true"] {
    background: var(--surface-fill);

    & :global(.bar-symbol) {
      color: var(--ink-strong);
    }
  }
  /* The glyph's own box, which the count mark is anchored to. */
  .glyph-box {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
  }
  /* The work tab's count in vermillion, centred on the glyph's top-trailing
     corner: the caps role, a space-1 pad, cut out of the glyph by a ring of
     the glass's surface. */
  .count-mark {
    --mark: calc(1lh + var(--space-1));
    position: absolute;
    inset-block-start: calc(var(--mark) / -2);
    inset-inline-end: calc(var(--mark) / -2);
    display: grid;
    place-items: center;
    min-inline-size: var(--mark);
    block-size: var(--mark);
    padding-inline: calc(var(--space-1) / 2);
    box-sizing: border-box;
    border-radius: var(--radius-xs);
    background: var(--chip-chosen-bg);
    box-shadow: 0 0 0 1px var(--surface-raised);
    color: var(--chip-chosen-ink);
    font: var(--type-caps);
    font-variant-numeric: tabular-nums;
  }
  /* MachinesButton: the number beside its glyph, --space-2 apart. */
  .machines {
    gap: var(--space-2);
    padding-inline: var(--space-2) calc(var(--space-2) - var(--c-bar-group-pad));
  }
  .machines-num {
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
  }
  /* NeedsCaw's capsule: a circle the item's size, his rim on the glass's
     edge past it. */
  .capsule {
    display: grid;
    place-items: center;
    inline-size: var(--c-bar-item);
  }
  .caw {
    position: absolute;
    inset: 50% auto auto 50%;
    inline-size: var(--c-btn-h);
    block-size: var(--c-btn-h);
    max-inline-size: none;
    translate: -50% -50%;
    pointer-events: none;
  }
  /* Shell's phone glass: a tab tucked into the screen's trailing edge,
     square on that side, which draws no edge, round on the other; Files and
     Caw each the glass's whole box, a coarse pointer's 16px apart. */
  .tools[data-phone] {
    --hit-gap-x: 16px;
    gap: 16px;
    block-size: var(--c-bar-caw-glass-phone);
    padding: 0;
    border-radius: calc(var(--c-bar-caw-glass-phone) / 2) 0 0
      calc(var(--c-bar-caw-glass-phone) / 2);

    &::before {
      border-inline-end-width: 0;
    }
    & :is([data-bar-item="jump"], .machines) {
      display: none;
    }
    & .bar-item {
      inline-size: var(--c-bar-caw-glass-phone);
      min-inline-size: var(--c-bar-caw-glass-phone);
      block-size: var(--c-bar-caw-glass-phone);
    }
    /* His head the glass less the group's pad each side
       (`c-bar-caw-head-phone`), as the desk's still is the item's. */
    & .caw {
      inline-size: var(--c-bar-caw-glass-phone);
      block-size: var(--c-bar-caw-glass-phone);
    }
  }
</style>
