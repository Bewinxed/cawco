<script lang="ts" module>
  import type { PinState } from "@cawco/core/comments";
  import type {
    Machine,
    StagePoint,
    Variation,
  } from "@cawco/core/design-graph";

  /** A pin placed on a state's node (its anchor's `sheet.node`), as its pill draws it. */
  export interface NodePin {
    id: string;
    number: number;
    state: PinState;
  }

  /** What a press, a hover and a held press on a node or its chip do: the graph's hand (StateGraph). */
  export interface NodeHand {
    /** A pointer down: under a finger, held it previews. */
    down: (event: PointerEvent, point: StagePoint) => void;
    /** A hover previews; null lets it go. A finger never hovers. */
    hover: (event: PointerEvent, point: StagePoint | null) => void;
    /** Enter or Space on the node. */
    key: (point: StagePoint) => void;
    /** A node pin's pill pressed: its thread opens. */
    openPin: (id: string) => void;
    /** A press: keep it, or, in Comment mode, pin it. */
    press: (event: MouseEvent, point: StagePoint) => void;
  }

  /** A state node's data (Svelte Flow's `data`, a record). */
  export interface StateNodeData extends Record<string, unknown> {
    /** Which way its machine's ranks run: where its edges meet it. */
    dir: "LR" | "TB";
    file: string;
    hand: NodeHand;
    kept: StagePoint | null;
    /** The kept state is this node's (it, or one of its chips). */
    keptHere: boolean;
    peek: StagePoint | null;
    peekHere: boolean;
    pillAt: "corner" | "name";
    /** The pins placed on this state's node, and where their pills stand (call 7). */
    pins: NodePin[];
    state: Machine["states"][number];
  }
</script>

<script lang="ts">
  import { pointOf, samePoint } from "@cawco/core/design-graph";
  /**
   * A state of the design graph (Projects spec §5.10; the primitives spec
   * §1.3): a Svelte Flow node holding its name in words, the agent's note on
   * it (its doc comment, one line, whole on its title) and its variations'
   * chips. The kept state wears the selected pair with the coral edge, a
   * previewed one the hover's fill; a chip kept is the chosen chip, its
   * hover the coral edge, never a dark fill (pin 5). Its handles carry the
   * edges and draw nothing. A pin placed on the state as a whole stands as
   * its pill on the node (the primitives spec §4.3).
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import PinMark from "../PinMark.svelte";

  let { data }: NodeProps = $props();
  const node = $derived(data as StateNodeData);
  const point = $derived(
    node.keptHere && node.kept
      ? node.kept
      : pointOf(node.file, { story: node.state.story, interaction: "rest" })
  );
  const chipPoint = (variation: Variation): StagePoint =>
    pointOf(node.file, variation);
</script>

{#snippet pills()}
  {#each node.pins as pin (pin.id)}
    <button
      aria-label={`Comment ${pin.number}`}
      class="nodrag nopan pointer-events-auto touch-hit"
      data-node-pin={pin.number}
      onclick={(event) => {
        event.stopPropagation();
        node.hand.openPin(pin.id);
      }}
      type="button"
    >
      <PinMark number={pin.number} state={pin.state} tail="bottom-start" />
    </button>
  {/each}
{/snippet}

<!-- A state: the selected pair while kept, the hover's fill while previewed. -->
<!-- biome-ignore lint/a11y/useSemanticElements: a state's node holds its variations' own buttons, which a button cannot contain. -->
<div
  aria-current={node.keptHere || undefined}
  class="group/node relative flex w-c-graph-node-w flex-col gap-space-row rounded-sm border border-border-control bg-surface-raised px-space-3 py-space-2 shadow-tile transition-[background-color,border-color,box-shadow,scale] duration-(--dur-control) ease-out not-data-kept:hover:bg-surface-hover active:scale-(--press-scale) data-peek:not-data-kept:bg-surface-hover data-kept:border-brand-solid data-kept:bg-selected-bg data-kept:shadow-selected-shadow focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
  data-kept={node.keptHere || undefined}
  data-node={node.state.story}
  data-peek={node.peekHere || undefined}
  onclick={(event) => node.hand.press(event, point)}
  onkeydown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      node.hand.key(point);
    }
  }}
  onpointerdown={(event) => node.hand.down(event, point)}
  onpointerenter={(event) => node.hand.hover(event, point)}
  onpointerleave={(event) => node.hand.hover(event, null)}
  role="button"
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
  tabindex="0"
>
  <Handle
    id="in"
    isConnectable={false}
    position={node.dir === "LR" ? Position.Left : Position.Top}
    type="target"
  />
  {#if node.pins.length > 0 && node.pillAt === "corner"}
    <!-- The whole-state pin's pill at the node's top-right, `--space-1` in, as the whole-page pill stands at the well's (call 7). -->
    <span
      class="pointer-events-none absolute -top-space-2 end-space-1 flex gap-space-1"
      data-node-pins="corner">{@render pills()}</span
    >
  {/if}
  <!-- Its name in words, two lines at most, then the agent's note on it (its doc comment), one line, whole on its title. -->
  <span class="flex min-w-0 items-start gap-space-1">
    <span
      class="line-clamp-2 min-w-0 flex-1 type-label text-ink-strong text-pretty wrap-anywhere group-data-kept/node:text-selected-ink"
      title={node.state.name}>{node.state.name}</span
    >
    {#if node.pins.length > 0 && node.pillAt === "name"}
      <span class="flex flex-none gap-space-1" data-node-pins="name"
        >{@render pills()}</span
      >
    {/if}
  </span>
  {#if node.state.label}
    <span
      class="truncate type-meta text-ink-muted group-data-kept/node:text-ink-row"
      data-note
      title={node.state.label}>{node.state.label}</span
    >
  {/if}
  {#if node.state.variations.length > 0}
    <span class="mt-space-1 flex flex-col gap-space-1">
      {#each node.state.variations as variation (`${variation.story}|${variation.interaction}`)}
        {@const chip = chipPoint(variation)}
        <button
          class="nodrag min-h-c-badge-h truncate rounded-xs border border-border-control bg-surface-raised px-space-2 py-space-row text-start type-meta text-ink-row touch-hit transition-[background-color,border-color,color] duration-(--dur-control) ease-out not-data-kept:hover:border-brand-solid data-peek:not-data-kept:border-brand-solid data-kept:border-chip-chosen-bg data-kept:bg-chip-chosen-bg data-kept:text-chip-chosen-ink focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
          data-chip={`${variation.story}|${variation.interaction}`}
          data-kept={samePoint(chip, node.kept) || undefined}
          data-peek={samePoint(chip, node.peek) || undefined}
          onclick={(event) => {
            event.stopPropagation();
            node.hand.press(event, chip);
          }}
          onpointerdown={(event) => {
            event.stopPropagation();
            node.hand.down(event, chip);
          }}
          onpointerenter={(event) => node.hand.hover(event, chip)}
          title={variation.note ?? variation.label}
          type="button">{variation.label}</button
        >
      {/each}
    </span>
  {/if}
  <Handle
    id="out"
    isConnectable={false}
    position={node.dir === "LR" ? Position.Right : Position.Bottom}
    type="source"
  />
</div>
