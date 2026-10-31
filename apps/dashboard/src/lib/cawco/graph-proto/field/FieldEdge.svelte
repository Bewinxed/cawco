<script lang="ts" module>
  import type { Judge } from "../shared/judge.svelte";

  export interface FieldEdgeData extends Record<string, unknown> {
    from: string;
    judge: Judge;
    kind: "move" | "link";
    label: string | null;
    /** The move into the kept card: the scrubber, its play and its clips. */
    lit: boolean;
    to: string;
  }
</script>

<script lang="ts">
  /**
   * An arrow on the field: a move is the double line (it animates), a link
   * the single one with its label (T5, moves told from links), on Svelte
   * Flow's smooth-step path. The move into the kept card is its control
   * (T3): its knob drags along the arrow and holds the move there, its play
   * runs it, and its length opens the clips in a popover beside it (T9).
   */
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import {
    BaseEdge,
    EdgeLabel,
    type EdgeProps,
    getSmoothStepPath,
    useSvelteFlow,
  } from "@xyflow/svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconPlay } from "#lib/icons.js";
  import Clips from "../shared/Clips.svelte";
  import { stateOf } from "../shared/review.svelte";

  let {
    id,
    data,
    markerEnd,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  }: EdgeProps = $props();
  const edge = $derived(data as FieldEdgeData);
  const flow = useSvelteFlow();

  const drawn = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: numberOf("--radius-sm"),
      offset: numberOf("--space-3"),
    })
  );

  /** The path sampled, to put the knob on it and to read a pointer along it. */
  const samples = $derived.by(() => {
    if (typeof document === "undefined") {
      return [];
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", drawn[0]);
    const length = path.getTotalLength();
    return Array.from({ length: 64 }, (_, at) => {
      const point = path.getPointAtLength((length * at) / 63);
      return { x: point.x, y: point.y };
    });
  });
  const pointAt = (f: number) =>
    samples[Math.round(f * (samples.length - 1))] ?? { x: targetX, y: targetY };

  let scrub = $state<number | null>(null);
  const knob = $derived.by(() => {
    if (scrub !== null) {
      return scrub;
    }
    const { runner } = edge.judge;
    if (
      edge.judge.move?.to === edge.to &&
      (runner.running || runner.held) &&
      runner.length > 0
    ) {
      return runner.at / runner.length;
    }
    return 1;
  });

  const fractionOf = (event: PointerEvent): number => {
    const at = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    let best = 0;
    let near = Number.POSITIVE_INFINITY;
    samples.forEach((one, index) => {
      const d = Math.hypot(one.x - at.x, one.y - at.y);
      if (d < near) {
        near = d;
        best = index;
      }
    });
    return best / Math.max(1, samples.length - 1);
  };
  const length = $derived(edge.judge.lengthOf(edge.from, edge.to));
</script>

<g
  style:--xy-edge-stroke={edge.lit
    ? "var(--c-graph-edge-chosen)"
    : "var(--c-graph-edge-ink)"}
  style:--xy-edge-stroke-width={edge.kind === "move"
    ? "calc(3 * var(--c-graph-edge))"
    : "var(--c-graph-edge)"}
>
  <BaseEdge {id} interactionWidth={0} {markerEnd} path={drawn[0]} />
</g>
{#if edge.kind === "move"}
  <!-- The double line: the move's stroke with its middle cut out. -->
  <path
    class="pointer-events-none fill-none"
    d={drawn[0]}
    stroke="var(--c-graph-slab)"
    stroke-width="var(--c-graph-edge)"
  ></path>
{/if}
{#if edge.lit && edge.kind === "move"}
  {@const point = pointAt(knob)}
  <EdgeLabel transparent x={drawn[1]} y={drawn[2] - 28}>
    <span
      class="nopan nodrag flex items-center gap-space-1 rounded-pill bg-surface-raised p-px shadow-xs"
    >
      <button
        aria-label={words.playMove(
          stateOf(edge.from).name,
          stateOf(edge.to).name
        )}
        class={SYMBOL}
        onclick={() => edge.judge.play(edge.from, edge.to)}
        title={words.playMove(stateOf(edge.from).name, stateOf(edge.to).name)}
        type="button"><IconPlay /></button
      >
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              aria-label={words.clips(edge.judge.runner.clips.length)}
              class="rounded-pill px-space-2 type-meta text-ink-strong tabular-nums hover:bg-surface-hover"
              type="button"
              >{length === null ? words.notMeasured : words.ms(length)}</button
            >
          {/snippet}
        </Popover.Trigger>
        <Popover.Content align="center" width="widest">
          <Clips judge={edge.judge} />
        </Popover.Content>
      </Popover.Root>
    </span>
  </EdgeLabel>
  <EdgeLabel transparent x={point.x} y={point.y}>
    <span
      aria-label={words.holdMove(
        stateOf(edge.from).name,
        stateOf(edge.to).name
      )}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(knob * 100)}
      class="nopan nodrag block size-c-pin cursor-grab touch-none rounded-pill bg-ink-solid ring-2 ring-surface-raised shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
      data-knob
      onpointerdown={async (event) => {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the gesture carries on uncaptured.
        }
        scrub = 0;
        await edge.judge.scrubStart(edge.from, edge.to);
        if (scrub !== null) {
          edge.judge.scrub(scrub);
        }
      }}
      onpointermove={(event) => {
        if (scrub !== null) {
          scrub = fractionOf(event);
          edge.judge.scrub(scrub);
        }
      }}
      onpointerup={async () => {
        if (scrub !== null) {
          const f = scrub;
          scrub = null;
          await edge.judge.scrubEnd(f);
        }
      }}
      role="slider"
      tabindex="0"
    ></span>
  </EdgeLabel>
{:else if edge.label}
  <EdgeLabel transparent x={drawn[1]} y={drawn[2]}>
    <span
      class="block max-w-c-graph-label-max-w truncate rounded-xs border border-border-hairline bg-c-graph-label-bg px-space-2 type-meta text-ink-row"
      title={edge.label}>{edge.label}</span
    >
  </EdgeLabel>
{/if}
