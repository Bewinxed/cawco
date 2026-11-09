<script lang="ts">
  /**
   * The graph refits whenever it gains or loses a node, gliding to the new
   * frame over --dur-panel on --ease-in-out (movement on screen). The first
   * frame is the canvas's own `fitView`, drawn in place; Svelte Flow holds a
   * fit until the nodes it frames are measured.
   *
   * It also refits, in place, when the canvas itself changes size or its
   * nodes are laid out again (`layout`, once they are measured), for as long
   * as the view is still the one a fit gave (`held` false). The first fit is
   * taken the moment the nodes are measured, which in a pane group is while
   * the canvas's pane is still at its least width and has not taken its
   * share: without this the graph stayed framed for a pane a quarter
   * narrower than the one it stands in. A view the person has panned or
   * zoomed is theirs and is left alone.
   *
   * `minZoom` is the least zoom a fit takes (a graph whose names must stay
   * readable is panned past it); the canvas's tools ask `fit()` for the same
   * frame the graph opened on. A graph too big to fit whole at `minZoom`
   * stands at that zoom on its `focus` (the point the person came for: the
   * design graph's kept card), not on the middle of the whole, which may
   * hold nothing he asked about.
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import {
    dur,
    easeInOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { FIT, fitPadding } from "./fit";
  import { onCanvasResize } from "./resized.svelte";

  let {
    nodeCount,
    held = false,
    layout,
    minZoom,
    focus,
    insets = { top: 0, bottom: 0 },
  }: {
    nodeCount: number;
    held?: boolean;
    /** The nodes' placement, as a key: a change refits in place. */
    layout?: string;
    minZoom?: number;
    /** Where a fit held at `minZoom` centres the view, in the flow's own coordinates, the room `insets` keeps already counted; null: the whole's middle. */
    focus?: () => { x: number; y: number } | null;
    /** What floats over the canvas's top and foot, px (a head, a group of tools): the fit stands clear of it; a `focus` says its middle with the same room kept. */
    insets?: { top: number; bottom: number };
  } = $props();
  const { fitView, getZoom, setCenter } = useSvelteFlow();
  /** A fit held at `minZoom` (the whole too big for it): centred on the focus instead. */
  const onFocus = async (fitted: Promise<boolean>, duration = 0) => {
    await fitted;
    const at = focus?.();
    if (at && minZoom !== undefined && getZoom() <= minZoom + 0.001) {
      await setCenter(at.x, at.y, { zoom: minZoom, duration });
    }
  };
  const frame = () => ({
    ...FIT,
    ...(insets.top > 0 || insets.bottom > 0
      ? { padding: fitPadding(insets) }
      : {}),
    ...(minZoom === undefined ? {} : { minZoom }),
  });

  /** Frames the graph as it opened, gliding there. */
  export function fit(): void {
    const duration = motionOk.current ? dur("--dur-panel") : 0;
    onFocus(fitView({ ...frame(), duration, ease: easeInOut }), duration);
  }

  let framed: number | undefined;
  $effect(() => {
    const count = nodeCount;
    if (framed !== undefined && count !== framed) {
      untrack(fit);
    }
    framed = count;
  });
  onCanvasResize(() => {
    if (!held) {
      onFocus(fitView(frame()));
    }
  });
  let placed: string | undefined;
  $effect(() => {
    const key = layout;
    const before = placed;
    placed = key;
    if (before !== undefined && before !== key && !untrack(() => held)) {
      onFocus(fitView(untrack(frame)));
    }
  });
</script>
