<script lang="ts">
  /**
   * One frame of the page: a document at its real size (a desk's 1440 ×
   * 900, a phone's 390 × 844), so everything in it lays out and measures as
   * in the app, scaled down whole to the room it is given; or, with `view`,
   * only that part of it (a bar's trailing end), the document still laid
   * out at its whole size.
   */
  let {
    src,
    width,
    height,
    view,
    title,
  }: {
    src: string;
    width: number;
    height: number;
    /** The part of the document shown, in its own pixels. */
    view?: { x: number; y: number; width: number; height: number };
    title: string;
  } = $props();

  const shown = $derived(view ?? { x: 0, y: 0, width, height });
  let box = $state<HTMLDivElement>();
  let scale = $state(1);
  $effect(() => {
    if (!box) {
      return;
    }
    const part = shown;
    // The box's two sides round apart: the frame takes the smaller scale,
    // so it never stands past its box by a fraction.
    const seen = new ResizeObserver(([entry]) => {
      scale = Math.min(
        entry.contentRect.width / part.width,
        entry.contentRect.height / part.height
      );
    });
    seen.observe(box);
    return () => seen.disconnect();
  });
</script>

<!-- The edge outside the well, so the well alone holds the document's
     ratio and a thin view fills it edge to edge. -->
<div class="frame">
  <div
    bind:this={box}
    class="well"
    data-frame-box
    data-view={view ? "" : undefined}
    style:aspect-ratio="{shown.width} / {shown.height}"
  >
    <iframe
      {src}
      style:block-size="{height}px"
      style:inline-size="{width}px"
      style:transform="scale({scale}) translate({-shown.x}px, {-shown.y}px)"
      {title}
    ></iframe>
  </div>
</div>

<style>
  .frame {
    overflow: clip;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    box-shadow: var(--shadow-tile);
  }
  .well {
    position: relative;
    overflow: clip;
  }
  iframe {
    position: absolute;
    inset: 0 auto auto 0;
    border: 0;
    transform-origin: 0 0;
  }
</style>
