<script lang="ts">
  /**
   * The app's view tree over a picture of it (a live stream's frame or a
   * still): one box per node, read from the nodes the picture carries
   * (`data-node`), as the app's accessibility tree would give them. A box
   * is invisible at rest; under the pointer it draws its edge, and a press
   * picks it, its edge in the action ink with the comment's pill on its
   * corner. As browser DevTools' element tooltip does, one tag names the
   * class (UILabel, UIButton) of the one node under the pointer or the
   * focus: outside its box, above it or, with no room there, below it,
   * kept inside the picture and off the text around it where any place
   * is. `hover` holds one node under the pointer by its label (a story's
   * pointer). `wire` draws every box at once, the picture dimmed by its
   * owner.
   */
  import { tick } from "svelte";
  import { frameObserver } from "../../frame-observer";
  import { numberOf } from "../../motion/curves.svelte";
  import PinMark from "../PinMark.svelte";

  let {
    root,
    wire = false,
    pin = null,
    picked = $bindable(true),
    hover = null,
  }: {
    /** A node held under the pointer, by its label: a story's pointer. */
    hover?: string | null;
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
  /** The node under the pointer or the focus. */
  let under = $state<number | null>(null);
  const active = $derived(
    under ??
      boxes.find((box) => hover !== null && box.label === hover)?.id ??
      null
  );
  let tag = $state<HTMLSpanElement>();
  /** Where the tag stands in the layer, once placed. */
  let spot = $state<{ x: number; y: number } | null>(null);
  /** The text the picture draws, in the layer's terms: the tag keeps off it. */
  let words: DOMRect[] = [];

  /**
   * The tag's place for box `box`: above it, then below it, each at its
   * start and then its end, clamped inside the layer; the first that covers
   * no text, else the one that covers least.
   */
  function place(box: Box) {
    if (!(tag && layer)) {
      return;
    }
    const gap = numberOf("--space-2") || 8;
    const { width: w, height: h } = tag.getBoundingClientRect();
    const room = layer.getBoundingClientRect();
    const clamp = (value: number, most: number) =>
      Math.max(0, Math.min(value, Math.max(0, most)));
    const tries = [
      [box.x, box.y - h - gap],
      [box.x, box.y + box.h + gap],
      [box.x + box.w - w, box.y - h - gap],
      [box.x + box.w - w, box.y + box.h + gap],
    ].map(([x, y]) => ({
      x: clamp(x, room.width - w),
      y: clamp(y, room.height - h),
    }));
    const covers = ({ x, y }: { x: number; y: number }) =>
      words.reduce((sum, word) => {
        const across = Math.min(x + w, word.right) - Math.max(x, word.left);
        const down = Math.min(y + h, word.bottom) - Math.max(y, word.top);
        return sum + (across > 0 && down > 0 ? across * down : 0);
      }, 0);
    let best = tries.at(0) ?? { x: 0, y: 0 };
    let least = Number.POSITIVE_INFINITY;
    for (const one of tries) {
      const over = covers(one);
      if (over < least) {
        least = over;
        best = one;
      }
      if (over === 0) {
        break;
      }
    }
    spot = best;
  }

  $effect(() => {
    const id = active;
    const box = boxes.find((one) => one.id === id);
    spot = null;
    if (!box) {
      return;
    }
    tick().then(() => place(box));
  });

  function measure() {
    if (!(root && layer)) {
      return;
    }
    const at = layer.getBoundingClientRect();
    const meets = (a: DOMRect, b: DOMRect) =>
      a.right > b.left &&
      a.left < b.right &&
      a.bottom > b.top &&
      a.top < b.bottom;
    // A node hidden by a box that clips it (a card past the screen's foot)
    // has no box: the tree is of what is shown.
    const shown = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      for (
        let up: HTMLElement | null = node;
        up && up !== root.parentElement;
        up = up.parentElement
      ) {
        if (
          up !== node &&
          getComputedStyle(up).overflow !== "visible" &&
          !meets(box, up.getBoundingClientRect())
        ) {
          return false;
        }
      }
      return true;
    };
    const nodes = [
      root,
      ...root.querySelectorAll<HTMLElement>("[data-node]"),
    ].filter((node) => node.dataset.node && shown(node));
    words = [...root.querySelectorAll<HTMLElement>("*")]
      .filter((el) =>
        [...el.childNodes].some(
          (child) => child.nodeType === 3 && child.textContent?.trim()
        )
      )
      .map((el) => {
        const box = el.getBoundingClientRect();
        return new DOMRect(
          box.left - at.left,
          box.top - at.top,
          box.width,
          box.height
        );
      })
      .filter((box) => box.width > 0 && box.height > 0);
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

<!-- mark-line: a layer of boxes over a picture; the class tag and the pins stand apart, never on one line -->
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
      class="pointer-events-auto absolute start-(--box-x) top-(--box-y) h-(--box-h) w-(--box-w) rounded-xs border border-transparent outline-1 outline-offset-(--space-1) outline-transparent outline-solid transition-[outline-color] duration-(--dur-control) ease-out in-data-wire:border-border-control-strong not-aria-pressed:data-under:outline-2 not-aria-pressed:data-under:outline-action-solid aria-pressed:outline-2 aria-pressed:outline-action-solid data-window:pointer-events-none"
      data-window={box.depth < 0 || undefined}
      data-node-box={box.kind}
      data-under={active === box.id || undefined}
      onblur={() => {
        if (under === box.id) {
          under = null;
        }
      }}
      onclick={() => {
        chosen = box.id;
        picked = true;
      }}
      onfocus={() => {
        under = box.id;
      }}
      onpointerenter={() => {
        under = box.id;
      }}
      onpointerleave={() => {
        if (under === box.id) {
          under = null;
        }
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
  {#if active !== null}
    {@const box = boxes.find((one) => one.id === active)}
    {#if box}
      <!-- The one class tag, for the node under the pointer, placed by place(). -->
      <span
        bind:this={tag}
        class="pointer-events-none absolute start-(--tag-x) top-(--tag-y) whitespace-nowrap rounded-xs bg-surface-raised px-space-1 text-ink-strong type-code liga-none shadow-xs not-data-placed:invisible"
        data-placed={spot ? "" : undefined}
        data-slot="node-kind"
        style:--tag-x={`${spot?.x ?? 0}px`}
        style:--tag-y={`${spot?.y ?? 0}px`}>{box.kind}</span
      >
    {/if}
  {/if}
</div>
