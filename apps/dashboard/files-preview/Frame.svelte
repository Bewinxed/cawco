<script lang="ts">
  /**
   * One frame of the page: a document at its real size (a desk's 1440 ×
   * 900, a phone's 390 × 844), so everything in it lays out and measures as
   * in the app, scaled down whole to the room it is given.
   */
  let {
    src,
    width,
    height,
    title,
  }: { src: string; width: number; height: number; title: string } = $props();

  let box = $state<HTMLDivElement>();
  let scale = $state(1);
  $effect(() => {
    if (!box) {
      return;
    }
    // The box's two sides round apart: the frame takes the smaller scale,
    // so it never stands past its box by a fraction.
    const seen = new ResizeObserver(([entry]) => {
      scale = Math.min(
        entry.contentRect.width / width,
        entry.contentRect.height / height
      );
    });
    seen.observe(box);
    return () => seen.disconnect();
  });
</script>

<div
  bind:this={box}
  class="frame"
  data-frame-box
  style:aspect-ratio="{width} / {height}"
>
  <iframe
    {src}
    style:block-size="{height}px"
    style:inline-size="{width}px"
    style:transform="scale({scale})"
    {title}
  ></iframe>
</div>

<style>
  .frame {
    position: relative;
    inline-size: 100%;
    overflow: clip;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    box-shadow: var(--shadow-tile);
  }
  iframe {
    position: absolute;
    inset: 0 auto auto 0;
    border: 0;
    transform-origin: 0 0;
  }
</style>
