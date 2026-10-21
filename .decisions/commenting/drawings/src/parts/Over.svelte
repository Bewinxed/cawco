<!--
  A box standing exactly over one of the real form's elements (`find`, a
  selector inside `root`), so a comment's pins, its outline and its name tag
  stand on that element as they would in the preview's overlay, without
  reaching into the form's own markup. It follows the element as the page
  lays out (fonts, sizes). It takes no presses and paints nothing itself
  (`data-over-box`: render.ts reads it as geometry, never as a surface).
  Its corners are the element's own computed radii, `--radius-xs` at the
  least. Chosen (`outlined`: the composer open on it, or its pin's thread),
  it marks the element as the overlay's `.rect` does under The One Target
  Rule: the live overlay's own tint (8% coral, `color-mix` in oklch, by day
  and night, see-through, so the element's words show under it) and a
  `--c-target-stroke` (1px) `brand-solid` line: on the border box (offset
  0) of an element that draws its own box (a border or a fill: a field, a
  button), and `--space-row` (2px) outside a bare one (no border, no fill:
  a label and its field together), so it never touches its glyphs. An
  outline's corners grow with its offset, so it stays concentric.
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

  let box = $state<{ x: number; y: number; w: number; h: number; radius: string; bare: boolean } | null>(null);

  $effect(() => {
    const target = root.querySelector(find);
    if (!target) {
      throw new Error(`Over: nothing in the page matches ${find}`);
    }
    const measure = () => {
      const r = root.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const own = getComputedStyle(target);
      const floor = Number.parseFloat(getComputedStyle(root).getPropertyValue("--radius-xs")) || 0;
      const radius = [own.borderTopLeftRadius, own.borderTopRightRadius, own.borderBottomRightRadius, own.borderBottomLeftRadius]
        .map((corner) => `${Math.max(Number.parseFloat(corner) || 0, floor)}px`)
        .join(" ");
      // Whether it draws its own box: a border to stand the line on, or a fill.
      const edged = ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          Number.parseFloat(own.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
          own.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none"
      );
      const filled = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(own.backgroundColor) || own.backgroundImage !== "none";
      box = {
        x: t.left - r.left - root.clientLeft,
        y: t.top - r.top - root.clientTop,
        w: t.width,
        h: t.height,
        radius,
        bare: !(edged || filled),
      };
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
      outlined && "bg-[color-mix(in_oklch,var(--brand-solid)_8%,transparent)] outline-(length:--c-target-stroke) outline-solid outline-brand-solid",
    ]}
    data-anchor={name}
    data-over-box
    data-bare={box.bare || undefined}
    style:border-radius={box.radius}
    style:outline-offset={outlined ? (box.bare ? "var(--space-row)" : "0px") : undefined}
    style:height="{box.h}px"
    style:left="{box.x}px"
    style:top="{box.y}px"
    style:width="{box.w}px"
  >
    {@render children?.()}
  </div>
{/if}
