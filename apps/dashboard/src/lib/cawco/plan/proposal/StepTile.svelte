<script lang="ts">
  /**
   * THE STEP TILE (proposal): the one mark every step row leads with. An
   * 18px square at `radius-xs`, raised fill, a 1px control edge, a 12px
   * Solar duotone glyph centred: TreeMark's 18px cell built as an icon
   * tile, so a session's own step and a delegate's SessionMark are one
   * shape at one size, paper for the one, the identity hue for the other.
   *
   * The glyph says the state before any hue does: empty to do, the Working
   * glyph breathing while doing, the Needs-you glyph waiting on you, the
   * hourglass waiting on a step or a slot, the house tick done, the
   * close-circle failed. A new glyph grows in from 0.25 out of a 4px blur
   * over 120ms (Icon swap); the tick then draws along its stroke over
   * 160ms. A to-do's tile is its checkbox (`onpress`).
   */
  import { fade } from "svelte/transition";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import {
    IconError,
    IconNeedsYou,
    IconTick,
    IconWorking,
  } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphWaiting from "~icons/solar/hourglass-line-bold-duotone";
  import type { StepState } from "./fixtures";

  let {
    state,
    label,
    onpress,
  }: {
    state: StepState;
    /** The step's words: the checkbox's name. */
    label?: string;
    /** A to-do's tile ticks it. */
    onpress?: () => void;
  } = $props();

  /** The glyph swap: grows from 0.25 out of a 4px blur, then the tick draws. */
  function swapIn(_node: Element) {
    const moves = motionOk.current;
    return {
      duration: moves ? 280 : 120,
      css: (_t: number, u: number) => {
        if (!moves) {
          return `opacity: ${1 - u}`;
        }
        // 0–120ms: the glyph arrives; 120–280ms: the tick's stroke draws.
        const k = Math.min(1, (1 - u) * (280 / 120));
        const eased = 1 - (1 - k) ** 3;
        const drawn = Math.max(0, ((1 - u) * 280 - 120) / 160);
        return `opacity: ${eased}; scale: ${0.25 + 0.75 * eased}; filter: blur(${4 * (1 - eased)}px); --draw: ${1 - (1 - (1 - drawn) ** 3)}`;
      },
    };
  }
</script>

{#snippet glyph()}
  {#key state}
    <span
      class="glyph"
      data-glyph={state}
      in:swapIn
      out:fade={{ duration: 120 }}
    >
      {#if state === "doing"}
        <IconWorking aria-hidden="true" />
      {:else if state === "you"}
        <IconNeedsYou aria-hidden="true" />
      {:else if state === "waiting"}
        <GlyphWaiting aria-hidden="true" />
      {:else if state === "done"}
        <IconTick aria-hidden="true" />
      {:else if state === "failed"}
        <IconError aria-hidden="true" />
      {/if}
    </span>
  {/key}
{/snippet}

{#if onpress}
  <!-- biome-ignore lint/a11y/useSemanticElements: the to-do's checkbox is the step tile, not the kit's box. -->
  <button
    aria-checked={state === "done"}
    aria-label={label}
    class="tile pressable touch-hit"
    data-slot="step-tile"
    data-state={state}
    onclick={onpress}
    role="checkbox"
    type="button">{@render glyph()}</button
  >
{:else}
  <span aria-hidden="true" class="tile" data-slot="step-tile" data-state={state}
    >{@render glyph()}</span
  >
{/if}

<style>
  .tile {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--pv-tile, 18px);
    block-size: var(--pv-tile, 18px);
    padding: 0;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    color: var(--ink-muted);
  }
  button.tile {
    cursor: pointer;
    transition:
      border-color var(--dur-control) var(--ease-out),
      background-color var(--dur-control) var(--ease-out);

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition:
        border-color var(--dur-control) var(--ease-out),
        background-color var(--dur-control) var(--ease-out),
        scale var(--dur-control) var(--ease-out);
      &:active {
        scale: var(--press-scale);
      }
    }
  }
  @media (hover: hover) and (pointer: fine) {
    button.tile:hover {
      border-color: var(--ink-subtle);
    }
  }
  .glyph {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;

    & :global(svg) {
      inline-size: calc(var(--pv-tile, 18px) * 2 / 3);
      block-size: calc(var(--pv-tile, 18px) * 2 / 3);
    }
  }
  .tile[data-state="doing"] .glyph {
    color: var(--status-live-glyph);
  }
  /* Live work breathes (DESIGN.md): the Working glyph to 45% on --breath. */
  @media (prefers-reduced-motion: no-preference) {
    .tile[data-state="doing"] .glyph {
      animation: pv-breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  .tile[data-state="you"] .glyph {
    color: var(--status-attn-glyph);
  }
  .tile[data-state="done"] .glyph {
    color: var(--status-done-glyph);

    & :global(path) {
      stroke-width: 2.25;
      stroke-dasharray: 20;
      stroke-dashoffset: calc(var(--draw, 0) * 20);
    }
  }
  .tile[data-state="failed"] .glyph {
    color: var(--status-fail-glyph);
  }
  /* The breath's lowest point keeps a status glyph's 3:1 on the tile: at
     45% (the Working glyph's own breath on a session row) the pale blue
     glyph fell to about 2:1 here and read as disabled. */
  @keyframes pv-breath {
    50% {
      opacity: 0.72;
    }
  }
</style>
