<script lang="ts">
  /**
   * Layout in use. Layers: the four planes stacked as the product stacks them,
   * each piece on its real z-index token, so their order on the board is the
   * order on screen. Containers: a real row list at either side of the
   * `xs` tier, where its second line moves from beside its mark to under it.
   * Breakpoints follow the viewport, which one frame can't change; the
   * graph's width switch shows them.
   */
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";

  const LAYERS = [
    {
      name: "Toasts and the screen's edges",
      token: "top",
      z: "z-(--layer-top)",
    },
    {
      name: "Popovers, menus, dialogs, tooltips",
      token: "float",
      z: "z-(--layer-float)",
    },
    {
      name: "Sheets and Caw's float",
      token: "sheet",
      z: "z-(--layer-sheet)",
    },
    {
      name: "The top bar and the bulk bar",
      token: "bar",
      z: "z-(--layer-bar)",
    },
  ];

  /** Writes each plane's z-index, read off its element, under its name. */
  const zOf = (node: HTMLElement) => {
    const tag = node.querySelector<HTMLElement>("[data-z]");
    if (tag) {
      tag.textContent = `${tag.dataset.z} · z ${getComputedStyle(node).zIndex}`;
    }
  };
</script>

<div class="flex flex-col gap-space-6">
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-ink-muted type-meta">
      Layers, back to front
    </figcaption>
    <div class="relative isolate grid h-72">
      {#each LAYERS as layer, index (layer.token)}
        <div
          class={[
            "surface col-start-1 row-start-1 h-28 w-64 translate-x-(--plane-x) translate-y-(--plane-y) rounded-lg border border-border-control p-space-3",
            layer.z,
          ]}
          style:--surface-level={2}
          style:--plane-x={`calc(${LAYERS.length - 1 - index} * var(--spacing-space-8))`}
          style:--plane-y={`calc(${LAYERS.length - 1 - index} * (var(--spacing-space-8) + var(--spacing-space-4)))`}
          {@attach zOf}
        >
          <p class="type-label">{layer.name}</p>
          <p
            class="text-ink-muted tabular-nums type-meta"
            data-z={layer.token}
          ></p>
        </div>
      {/each}
    </div>
  </figure>

  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-ink-muted type-meta">
      Containers: the same rows in a box under 320px and over it. Under, the
      line below a row moves under its mark
    </figcaption>
    <div class="flex flex-wrap items-start gap-space-4">
      <div class="w-72"><RowFrame withBelow /></div>
      <div class="w-96"><RowFrame withBelow /></div>
    </div>
  </figure>

  <p class="text-ink-muted type-meta">
    Breakpoints: phone under 640px, desk from 900px. They follow the window, so
    switch this graph's width to 390 or 1440 to see them.
  </p>
</div>
