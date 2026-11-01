<script lang="ts">
  /**
   * The steps bar's slider (the owner's pick "Pill", and "It goes to a
   * state"): one wide field over a component's states in the agent's order,
   * its chip inside the fill naming the state it stands on, as the effort
   * chip does (DESIGN.md, Effort chip). It is bits-ui's Slider, so a drag, a
   * press on the track, the arrow keys, Home and End all land on a state and
   * never between two. A dot marks each state the chip doesn't cover, so the
   * stops are seen before the drag.
   *
   * The chip is as wide as the longest title, up to half the field, so the
   * rail never moves; a title longer than that ends in an ellipsis inside
   * it, whole in its name for a screen reader.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { cn } from "#lib/utils.js";
  import type { GraphState } from "./graph";

  let {
    states,
    value,
    onchange,
    class: className,
  }: {
    states: GraphState[];
    /** The kept state's id. */
    value: string;
    onchange: (id: string) => void;
    class?: string;
  } = $props();

  const at = $derived(
    Math.max(
      0,
      states.findIndex((one) => one.id === value)
    )
  );
  const n = $derived(states.length);
  const p = $derived(n > 1 ? at / (n - 1) : 0);
  const title = $derived(states[at]?.title ?? "");

  let knob = $state(0);
  const measureKnob = frameSize<HTMLElement>((node) => {
    knob = node.offsetWidth;
  });
  let track = $state(0);
  const measureTrack = frameSize<HTMLElement>((node) => {
    track = node.clientWidth;
  });
  /** Nothing slides in from zero: transitions wait for the first measure. */
  let ready = $state(false);
  $effect(() => {
    if (knob && !ready) {
      const frame = requestAnimationFrame(() => {
        ready = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  });
  /** A dot shows only where it stands clear of the chip. */
  const clear = (index: number) => {
    const rail = Math.max(1, track - knob);
    const gap = Math.abs(index - at) * (n > 1 ? rail / (n - 1) : 0);
    return gap >= knob / 2 + 8;
  };
</script>

<Slider.Root
  type="single"
  class={cn(
    "group/steps touch-hit relative flex h-c-btn-h-sm min-w-0 items-center rounded-md border border-border-control bg-surface-raised select-none touch-none cursor-ew-resize max-phone:h-c-effort-track-h-phone coarse:h-c-effort-track-h-phone",
    className
  )}
  data-ready={ready || undefined}
  max={Math.max(0, n - 1)}
  min={0}
  onValueChange={(next) => {
    const state = states[next];
    if (state && state.id !== value) {
      onchange(state.id);
    }
  }}
  step={1}
  thumbPositioning="contain"
  value={at}
  {@attach measureTrack}
>
  {#snippet children({ tickItems })}
    <!-- The fill and its dots clip in a layer of their own, so the field's
         touch area stands outside its box unclipped (The 44 Touch Rule). -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
    >
      <span
        class="absolute inset-y-0 start-0 w-(--fill) rounded-md bg-surface-recess-deep motion-safe:transition-[width] motion-safe:duration-(--dur-morph) motion-safe:ease-in-out group-not-data-ready/steps:transition-none"
        style:--fill={`calc(${knob}px + ${p} * (100% - ${knob}px))`}
      ></span>
    </span>
    {#each tickItems as tick (tick.index)}
      <Slider.Tick
        class={[
          "pointer-events-none size-space-1 rounded-pill bg-ink-strong transition-[opacity] duration-(--dur-control) ease-out group-not-data-ready/steps:transition-none",
          clear(tick.index) ? "opacity-30" : "opacity-0",
        ]}
        index={tick.index}
      />
    {/each}
    <Slider.Thumb
      aria-label={graphWords.steps}
      aria-valuetext={graphWords.stepOf(title, at + 1, n)}
      class="grid h-full max-w-1/2 place-items-center rounded-sm bg-surface-lift px-space-3 text-ink-strong shadow-knob outline-none focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) motion-safe:transition-[left] motion-safe:duration-(--dur-morph) motion-safe:ease-in-out group-not-data-ready/steps:transition-none"
      index={0}
      {@attach measureKnob}
    >
      <!-- As wide as the longest title, so the rail never moves. -->
      <span
        aria-hidden="true"
        class="invisible col-start-1 row-start-1 grid min-w-0 type-label"
      >
        {#each states as state (state.id)}
          <span class="col-start-1 row-start-1 truncate">{state.title}</span>
        {/each}
      </span>
      <span
        class="col-start-1 row-start-1 min-w-0 max-w-full truncate type-label"
        ><MorphText text={title} /></span
      >
    </Slider.Thumb>
  {/snippet}
</Slider.Root>
