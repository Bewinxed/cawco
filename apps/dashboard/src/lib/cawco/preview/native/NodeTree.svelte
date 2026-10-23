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

  /** One run of content the picture draws (a line of a text, an icon), and the element drawing it. */
  interface Ink {
    from: Element;
    rect: DOMRect;
  }

  interface Rect {
    bottom: number;
    left: number;
    right: number;
    top: number;
  }

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
  /** Each box's node in the picture, by the box's id. */
  let elements: HTMLElement[] = [];
  /** Where the tag stands in the layer, once placed. */
  let spot = $state<{ x: number; y: number } | null>(null);
  /**
   * The glyph runs drawn in `scope` (a range over each text, line by line,
   * not the boxes holding them: a full-width title leaves room beside its
   * words), in the terms of a box at `at`; the tree's own tag left out.
   */
  function glyphs(scope: Element, at: DOMRect): Ink[] {
    const range = document.createRange();
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const runs: Ink[] = [];
    const add = (from: Element, rect: DOMRect) => {
      if (rect.width > 0 && rect.height > 0) {
        runs.push({
          from,
          rect: new DOMRect(
            rect.left - at.left,
            rect.top - at.top,
            rect.width,
            rect.height
          ),
        });
      }
    };
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (
        !(text.textContent?.trim() && text.parentElement) ||
        layer?.contains(text)
      ) {
        continue;
      }
      range.selectNodeContents(text);
      for (const line of range.getClientRects()) {
        add(text.parentElement, line);
      }
    }
    // Icons are content as words are: a glyph drawn, not a box.
    for (const icon of scope.querySelectorAll("svg, img, [role='img']")) {
      if (!(layer?.contains(icon) || icon.parentElement?.closest("svg"))) {
        add(icon, icon.getBoundingClientRect());
      }
    }
    return runs;
  }

  /**
   * The tag's place for box `box`, clamped inside the picture (as DevTools
   * keeps its tooltip inside the viewport), by rank() below: off the node's
   * own content, off all other content, nearer this box than any other,
   * outside it where it can be (above, below, beside), else in one of its
   * own corners.
   */
  function place(box: Box) {
    if (!(tag && layer)) {
      return;
    }
    const gap = numberOf("--space-1") || 4;
    const { width: w, height: h } = tag.getBoundingClientRect();
    const room = layer.getBoundingClientRect();
    const words = root ? glyphs(root, room) : [];
    const clamp = (value: number, most: number) =>
      Math.max(0, Math.min(value, Math.max(0, most)));
    const own = {
      left: box.x,
      right: box.x + box.w,
      top: box.y,
      bottom: box.y + box.h,
    };
    // The boxes the tag could be taken for: every node but this one, the
    // nodes holding it and the nodes it holds.
    const self = elements[box.id];
    const others = boxes
      .filter((one) => {
        const el = elements[one.id];
        return (
          one.id !== box.id &&
          el &&
          self &&
          !el.contains(self) &&
          !self.contains(el)
        );
      })
      .map((one) => ({
        left: one.x,
        right: one.x + one.w,
        top: one.y,
        bottom: one.y + one.h,
      }));
    const at = (x: number, y: number): Rect => ({
      left: x,
      right: x + w,
      top: y,
      bottom: y + h,
    });
    const meets = (a: Rect, b: Rect) =>
      Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
      Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    const apart = (a: Rect, b: Rect) =>
      Math.hypot(
        Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)),
        Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
      );
    const middle = box.y + (box.h - h) / 2;
    // Outside first, as DevTools stands its tooltip: above, below, then
    // beside; then, where every outside place stands nearer another box,
    // inside the box's own corners.
    const tries = [
      [box.x, box.y - h - gap],
      [box.x + box.w - w, box.y - h - gap],
      [box.x, box.y + box.h + gap],
      [box.x + box.w - w, box.y + box.h + gap],
      [box.x - w - gap, middle],
      [box.x + box.w + gap, middle],
      [box.x + box.w - w - gap, box.y + gap],
      [box.x + gap, box.y + gap],
      [box.x + box.w - w - gap, box.y + box.h - h - gap],
      [box.x + gap, box.y + box.h - h - gap],
    ].map(([x, y]) => at(clamp(x, room.width - w), clamp(y, room.height - h)));
    // A place covers no glyph, and stands nearer its own box than any other
    // box (it is read as that box's); off the box itself is better still.
    // Ranked, first criterion first: (1) never over the hovered node's own
    // content (its words, its icons); (2) never over any other content;
    // (3) nearer its own box than any other; (4) outside its box. With no
    // place meeting (1) and (2), the one meeting (1) that covers least.
    const covered = (candidate: Rect, mine: boolean) =>
      words
        .filter((ink) => (self?.contains(ink.from) ?? false) === mine)
        .reduce((sum, ink) => {
          const r = ink.rect;
          const across =
            Math.min(candidate.right, r.right) -
            Math.max(candidate.left, r.left);
          const down =
            Math.min(candidate.bottom, r.bottom) -
            Math.max(candidate.top, r.top);
          return sum + (across > 0 && down > 0 ? across * down : 0);
        }, 0);
    const rank = (candidate: Rect) => {
      const ownInk = covered(candidate, true);
      const otherInk = covered(candidate, false);
      const near = others.every(
        (other) => apart(candidate, own) < apart(candidate, other)
      );
      const inside = meets(candidate, own);
      if (ownInk > 0) {
        return 1e9 + ownInk + otherInk;
      }
      if (otherInk > 0) {
        return 1e6 + otherInk;
      }
      return (near ? 0 : 2) + (inside ? 1 : 0);
    };
    let best = tries.at(0) ?? at(0, 0);
    let bestRank = Number.POSITIVE_INFINITY;
    for (const one of tries) {
      const value = rank(one);
      if (value < bestRank) {
        bestRank = value;
        best = one;
      }
      if (value === 0) {
        break;
      }
    }
    spot = { x: best.left, y: best.top };
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
    elements = nodes;
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
      <!-- The one class tag, for the node under the pointer, placed by
           place(): the house tooltip's chip (DESIGN.md, Tooltip; The Ink
           Stays Ink Rule): ink-solid, on-ink, meta, radius sm. -->
      <span
        bind:this={tag}
        class="pointer-events-none absolute start-(--tag-x) top-(--tag-y) whitespace-nowrap rounded-sm bg-ink-solid px-space-2 py-space-1 text-on-ink type-meta not-data-placed:invisible"
        data-placed={spot ? "" : undefined}
        data-slot="node-kind"
        style:--tag-x={`${spot?.x ?? 0}px`}
        style:--tag-y={`${spot?.y ?? 0}px`}>{box.kind}</span
      >
    {/if}
  {/if}
</div>
