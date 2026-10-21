<!--
  Pick 2's close-up: one marker shape at one, two and three digits, three
  comments stacked on one spot, and a pin pressed at the well's edge (the
  edge drawn as Comment mode draws it, 2px accent). Each cell is a strip of
  the page with the pressed point under the marker.
-->
<script lang="ts">
  import Pin from "./Pin.svelte";

  let { shape }: { shape: "tail" | "stem" } = $props();

  const CELLS = [
    { label: "1 digit", n: 7 },
    { label: "2 digits", n: 42 },
    { label: "3 digits", n: 108 },
  ];
</script>

<div class="inline-grid grid-cols-3 gap-space-3 bg-surface-raised p-space-3 [zoom:2]" data-board>
  {#each CELLS as cell (cell.n)}
    <figure class="flex flex-col gap-space-1">
      <div class="relative h-16 w-28 rounded-xs bg-surface-page" data-cell>
        <span class="absolute start-space-3 top-10 type-meta text-ink-muted">Save</span>
        <Pin n={cell.n} {shape} x="28px" y="40px" />
      </div>
      <figcaption class="type-meta text-ink-muted">{cell.label}</figcaption>
    </figure>
  {/each}
  <figure class="flex flex-col gap-space-1">
    <div class="relative h-16 w-28 rounded-xs bg-surface-page" data-cell>
      <span class="absolute start-space-3 top-10 type-meta text-ink-muted">Save</span>
      <Pin deck={[12, 11]} n={14} {shape} x="28px" y="40px" />
    </div>
    <figcaption class="type-meta text-ink-muted">Three on one spot</figcaption>
  </figure>
  <figure class="col-span-2 flex flex-col gap-space-1">
    <div
      class="relative h-16 w-full overflow-hidden rounded-xs border-e-2 border-brand-solid bg-surface-page"
      data-edge
      data-cell
    >
      <span class="absolute end-space-2 top-10 type-meta text-ink-muted">Help</span>
      <Pin
        n={103}
        place="up-left"
        {shape}
        shift={shape === "stem" ? "-12px" : "0px"}
        x="calc(100% - 8px)"
        y="40px"
      />
    </div>
    <figcaption class="type-meta text-ink-muted">At the well’s edge</figcaption>
  </figure>
</div>
