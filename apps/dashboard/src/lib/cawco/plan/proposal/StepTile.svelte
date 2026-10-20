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
   * over 120ms (Icon swap); the tick draws along its own stroke as it
   * arrives (the house `animate-check-draw` on a dash the whole path long,
   * DESIGN.md Ticks and dots). A to-do's tile is its checkbox (`onpress`).
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

  /** The tile: the tile's side square, raised, on the control edge, above the lines that run to it. */
  const TILE =
    "relative z-1 grid size-(--pv-tile) flex-none place-items-center rounded-xs border border-border-control bg-surface-raised p-0 text-ink-muted";

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

  /** The glyph swap: grows from 0.25 out of a 4px blur over 120ms; with less motion it only fades. */
  function swapIn(_node: Element) {
    const moves = motionOk.current;
    return {
      duration: 120,
      css: (t: number) => {
        if (!moves) {
          return `opacity: ${t}`;
        }
        const eased = 1 - (1 - t) ** 3;
        return `opacity: ${eased}; scale: ${0.25 + 0.75 * eased}; filter: blur(${4 * (1 - eased)}px)`;
      },
    };
  }
</script>

{#snippet glyph()}
  {#key state}
    <!-- Live work breathes on the one rule (design.css .breathe). -->
    <span
      class={[
        "col-start-1 row-start-1 grid place-items-center [&_svg]:size-(--pv-glyph)",
        state === "doing" && "breathe text-status-live-glyph",
        state === "you" && "text-status-attn-glyph",
        state === "done" && "text-status-done-glyph",
        state === "failed" && "text-status-fail-glyph",
      ]}
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
        <IconTick
          aria-hidden="true"
          class="[&_path]:stroke-2 motion-safe:animate-check-draw motion-safe:dash-unit"
        />
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
    class={[TILE, "pressable touch-hit hover:border-ink-subtle"]}
    data-slot="step-tile"
    data-state={state}
    onclick={onpress}
    role="checkbox"
    type="button">{@render glyph()}</button
  >
{:else}
  <span aria-hidden="true" class={TILE} data-slot="step-tile" data-state={state}
    >{@render glyph()}</span
  >
{/if}
