<script lang="ts">
  /**
   * The app's view tree over a picture of it (a live stream's frame or a
   * still): one box per node, read from the nodes the picture carries
   * (`data-node`), as the app's accessibility tree would give them. A box
   * is invisible at rest; under the pointer it draws its edge, and a press
   * picks it, its edge in the action ink with the comment's pill on its
   * corner. `wire` draws every box at once, the picture dimmed by its owner.
   */
  import { frameObserver } from "../../frame-observer";
  import PinMark from "../PinMark.svelte";

  let {
    root,
    wire = false,
    pin = null,
    picked = $bindable(true),
  }: {
    /** The picture whose nodes are drawn: the stand-in's box. */
    root: HTMLElement | undefined;
    /** Every box drawn, not only the one under the pointer. */
    wire?: boolean;
    /** The comment's number on the picked node. */
    pin?: number | null;
    /** The picked node stands picked. */
    picked?: boolean;
  } = $props();

  interface Box {
    depth: number;
    h: number;
    id: number;
    kind: string;
    label: string;
    w: number;
    x: number;
    y: number;
  }

  let layer = $state<HTMLDivElement>();
  let boxes = $state.raw<Box[]>([]);
  /** The node chosen by a press; the picked node until one is pressed. */
  let chosen = $state<number | null>(null);

  function measure() {
    if (!(root && layer)) {
      return;
    }
    const at = layer.getBoundingClientRect();
    const nodes = [
      root,
      ...root.querySelectorAll<HTMLElement>("[data-node]"),
    ].filter((node) => node.dataset.node);
    boxes = nodes.map((node, id) => {
      const box = node.getBoundingClientRect();
      if (node.hasAttribute("data-node-picked") && chosen === null) {
        chosen = id;
      }
      let depth = 0;
      for (
        let up = node.parentElement;
        up && up !== root;
        up = up.parentElement
      ) {
        if (up.dataset.node) {
          depth += 1;
        }
      }
      return {
        id,
        kind: node.dataset.node ?? "",
        label: node.dataset.nodeLabel ?? "",
        x: box.left - at.left,
        y: box.top - at.top,
        w: box.width,
        h: box.height,
        depth: node === root ? -1 : depth,
      };
    });
  }

  $effect(() => {
    const watched = root;
    const own = layer;
    if (!(watched && own)) {
      return;
    }
    measure();
    const seen = frameObserver(() => measure());
    seen.observe(watched);
    seen.observe(own);
    document.fonts?.ready.then(() => measure());
    return () => seen.disconnect();
  });
</script>

<div
  bind:this={layer}
  class="pointer-events-none absolute inset-0"
  data-slot="node-tree"
  data-wire={wire || undefined}
>
  {#each boxes as box (box.id)}
    {@const isPicked = picked && box.id === chosen}
    <button
      aria-label={`${box.kind} “${box.label}”`}
      aria-pressed={isPicked}
      class="pointer-events-auto absolute start-(--box-x) top-(--box-y) h-(--box-h) w-(--box-w) rounded-xs outline-1 -outline-offset-1 outline-transparent outline-solid transition-[outline-color] duration-(--dur-control) ease-out focus-visible:ring-2 focus-visible:ring-focus-ring not-aria-pressed:can-hover:hover:outline-2 not-aria-pressed:can-hover:hover:outline-action-solid border border-transparent in-data-wire:border-border-control-strong aria-pressed:outline-2 aria-pressed:outline-action-solid data-window:pointer-events-none"
      data-window={box.depth < 0 || undefined}
      data-node-box={box.kind}
      onclick={() => {
        chosen = box.id;
        picked = true;
      }}
      style:--box-h={`${box.h}px`}
      style:--box-w={`${box.w}px`}
      style:--box-x={`${box.x}px`}
      style:--box-y={`${box.y}px`}
      title={`${box.kind} “${box.label}”`}
      type="button"
    >
      {#if isPicked && pin !== null}
        <span class="absolute end-space-2 top-1/2 flex -translate-y-1/2">
          <PinMark number={pin} state="sent" tail="none" />
        </span>
      {/if}
    </button>
  {/each}
</div>
