<script lang="ts">
  /**
   * What the Curve chip opens: the curve list (ChoiceList: the design
   * system's curves with their glyphs, Spring, and the agent's own curve
   * as written while it is none of them) and, for a spring, its Bounce at
   * the foot, brought into view as Spring is picked: on a phone the list
   * was cut at 320px and Bounce stood below it with nothing to say so.
   *
   * Over the list, the chosen curve drawn (`bend`), its two control points
   * dragged or moved with the arrow keys, as Jitter's easing popover draws
   * its preset (his pick, animation-face-questions#curve-draw: "The list
   * with a curve to drag"); a curve kept in a transition's frames has
   * none. A spring is drawn there instead, read only (`springDrawn`): its
   * response from rest to rest, overshoot and all.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import ChoiceList from "./ChoiceList.svelte";
  import CurveGraph from "./CurveGraph.svelte";

  let {
    options,
    value,
    onpick,
    spring,
    bend = null,
    springDrawn = null,
    ref = $bindable(),
  }: {
    options: { value: string; name: string; glyph: string | null }[];
    value: string;
    onpick: (value: string) => void;
    /** The spring's bounce, 0 to `most`, when the curve is a spring. */
    spring: {
      bounce: number;
      most: number;
      onbounce: (bounce: number) => void;
    } | null;
    /** The chosen curve's four numbers to drag, when he may draw his own. */
    bend?: { at: number[]; onbend: (at: number[]) => void } | null;
    /** The spring's own easing (`linear(…)`), drawn read only while Spring is picked. */
    springDrawn?: string | null;
    ref?: HTMLElement;
  } = $props();

  /** Bounce while a drag holds it; the spring's own at rest. */
  let held = $state<number | null>(null);
  let bounceRow = $state<HTMLElement>();
  // Spring picked: its Bounce brought into the list's view.
  $effect(() => {
    if (spring && bounceRow) {
      bringIntoView(bounceRow);
    }
  });
</script>

{#if bend}
  <div class="px-space-3 pt-space-2 pb-space-3">
    <CurveGraph at={bend.at} onbend={bend.onbend} />
  </div>
{:else if springDrawn}
  <div class="px-space-3 pt-space-2 pb-space-3">
    <CurveGraph easing={springDrawn} />
  </div>
{/if}
<ChoiceList bind:ref label={words.curve} {onpick} {options} {value} />
{#if spring}
  <!-- The spring's one setting: how far it overshoots. -->
  <div
    bind:this={bounceRow}
    class="flex min-w-0 items-center gap-space-3 border-t border-border-hairline px-space-3 pt-space-2 pb-space-1"
  >
    <span class="type-label text-ink-muted">{words.bounce}</span>
    <Slider.Root
      class="relative flex h-c-btn-h-sm min-w-0 flex-1 touch-none items-center select-none"
      max={spring.most}
      min={0}
      onValueChange={(next: number) => {
        held = next;
      }}
      onValueCommit={(next: number) => {
        held = null;
        spring.onbounce(next);
      }}
      step={0.05}
      type="single"
      value={held ?? Math.min(spring.most, spring.bounce)}
    >
      <span
        class="relative h-space-1 w-full overflow-clip rounded-pill bg-surface-fill"
      >
        <Slider.Range class="absolute h-full rounded-pill bg-ink-muted" />
      </span>
      <Slider.Thumb
        aria-label={words.bounce}
        class="pointer-hit touch-hit block size-space-4 cursor-ew-resize rounded-pill border border-border-control bg-surface-raised shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
        index={0}
      />
    </Slider.Root>
    <span class="w-space-7 text-end type-meta text-ink-muted num"
      >{Math.round((held ?? spring.bounce) * 100)}%</span
    >
  </div>
{/if}
