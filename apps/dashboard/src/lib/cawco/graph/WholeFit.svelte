<script lang="ts">
  /**
   * How the whole set's map is framed (WholeSet), on open and after its
   * room resizes or its cards are laid out anew, while the view is still
   * the one a frame gave (`held` false): never under the readable zoom, so
   * no type renders under 12px. Where the whole map fits its room there,
   * it is fitted, nothing cut. Where it does not, it stands at that zoom
   * from the map's top-leading corner, moved by the least that brings the
   * kept state's group in whole (its card, where the room is smaller than
   * the group): nothing is scaled down to fit, and the kept state stands
   * among its own; a pan reaches the rest.
   */
  import { useStore, useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { onCanvasResize } from "#lib/components/features/flow/resized.svelte.js";

  let {
    held,
    layout,
    kept,
    group,
    zoom,
    pad,
  }: {
    held: boolean;
    /** The cards' placement, as a key: a change frames again. */
    layout: string;
    /** The kept state's card, by its node id. */
    kept: string;
    /** Its machine's group, by its node id: brought in whole where the room holds it, so a cut falls between groups. */
    group: string;
    /** The readable zoom, and the most a frame takes. */
    zoom: number;
    /** Room round the map, px. */
    pad: number;
  } = $props();
  const flow = useSvelteFlow();
  const store = useStore();

  /** Frames the map; `glide` moves there over --dur-panel (the tool's fit). */
  export function frame(glide = false): void {
    const nodes = flow.getNodes();
    const room = { w: store.width, h: store.height };
    if (nodes.length === 0 || room.w === 0 || room.h === 0) {
      return;
    }
    const all = flow.getNodesBounds(nodes);
    const card = flow.getNode(kept) ? flow.getNodesBounds([kept]) : all;
    const whole = flow.getNode(group) ? flow.getNodesBounds([group]) : card;
    const fits = (rect: { height: number; width: number }) =>
      rect.width * zoom + 2 * pad <= room.w &&
      rect.height * zoom + 2 * pad <= room.h;
    const box = fits(whole) ? whole : card;
    /** Where the view starts on one axis: the map's start, moved by the least that shows the card whole. */
    const startOf = (
      from: number,
      size: number,
      at: number,
      long: number,
      span: number
    ) => {
      if (size * zoom + 2 * pad <= span) {
        return (span - size * zoom) / 2 - from * zoom;
      }
      const start = pad - from * zoom;
      const cardEnd = (at + long) * zoom + start;
      return cardEnd + pad > span ? start - (cardEnd + pad - span) : start;
    };
    flow.setViewport(
      {
        x: startOf(all.x, all.width, box.x, box.width, room.w),
        y: startOf(all.y, all.height, box.y, box.height, room.h),
        zoom,
      },
      glide && motionOk.current
        ? { duration: dur("--dur-panel"), ease: easeInOut }
        : undefined
    );
  }

  let framedFor = "";
  $effect(() => {
    const key = `${layout}|${store.width > 0}`;
    if (key !== framedFor && store.width > 0 && !untrack(() => held)) {
      framedFor = key;
      untrack(() => frame());
    }
  });
  onCanvasResize(() => {
    if (!held) {
      frame();
    }
  });
</script>
