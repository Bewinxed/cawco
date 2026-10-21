<!--
  A box standing exactly over one of the real form's elements (`find`, a
  selector inside `root`), so a comment's pins, its outline and its name tag
  stand on that element as they would in the preview's overlay, without
  reaching into the form's own markup. It follows the element as the page
  lays out (fonts, sizes). It takes no presses and paints nothing itself
  (`data-over-box`: render.ts reads it as geometry, never as a surface).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    root,
    find,
    name,
    outlined = false,
    children,
  }: {
    root: HTMLElement;
    find: string;
    name: string;
    outlined?: boolean;
    children?: Snippet;
  } = $props();

  let box = $state<{ x: number; y: number; w: number; h: number } | null>(null);

  $effect(() => {
    const target = root.querySelector(find);
    if (!target) {
      throw new Error(`Over: nothing in the page matches ${find}`);
    }
    const measure = () => {
      const r = root.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      box = { x: t.left - r.left - root.clientLeft, y: t.top - r.top - root.clientTop, w: t.width, h: t.height };
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(root);
    sizes.observe(target);
    document.fonts.ready.then(measure);
    return () => sizes.disconnect();
  });
</script>

{#if box}
  <div
    class={[
      "pointer-events-none absolute z-10",
      outlined && "outline-2 outline-offset-2 outline-brand-solid",
    ]}
    data-anchor={name}
    data-over-box
    style:height="{box.h}px"
    style:left="{box.x}px"
    style:top="{box.y}px"
    style:width="{box.w}px"
  >
    {@render children?.()}
  </div>
{/if}
