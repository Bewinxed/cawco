<script lang="ts">
  /**
   * PROPOSED (pin 11): the panel resized, desk only. It is anchored under
   * his seat (start, bottom), so it grows down and to the trailing side and
   * the anchor stays put. Width 380 to min(720, 100vw − 24), height 400 to
   * the room under the seat; the size is kept per browser, as the rail's
   * width is, and written as --c-panel-w / --c-caw-panel-h on the panel,
   * which everything inside already scales off. Nothing animates during a
   * drag; a double press on a grip comes back to 380 × 640.
   *
   * - `grip` (A): the house's corner grip at the bottom-trailing corner, a
   *   24px zone (WCAG 2.5.8's least target), an L of 12px legs in a 1.5px
   *   control line standing in the gutter between the panel's edge and the
   *   message box, clear of the box's corner.
   * - `wide` (B): a "Wide panel" item in the head's More menu, 380 ↔ 560.
   *   A menu item, not a button in the head: a worded button there leaves
   *   the thread's name no room on a 380px panel.
   * - `edges` (C): a handle on the trailing edge and one on the bottom.
   */
  import { store } from "#lib/cawco/storage.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import type { Form } from "../form";

  let {
    form,
    mode,
  }: {
    /** Desk only: on a phone the panel is the sheet, which never resizes. */
    form: Form;
    mode: "grip" | "wide" | "edges";
  } = $props();

  const KEPT = "cawco.design.caw-panel-size";
  const REST = { w: 380, h: 640 };
  let node = $state<HTMLElement | null>(null);
  const pop = $derived(
    node?.closest<HTMLElement>(".caw-float-pop") ??
      document.querySelector<HTMLElement>(".caw-float-pop")
  );

  function bounds() {
    const sheet = window.innerHeight * 0.85;
    const room = pop
      ? Number.parseFloat(
          getComputedStyle(pop).getPropertyValue(
            "--bits-popover-content-available-height"
          )
        ) || sheet
      : sheet;
    return {
      w: [380, Math.min(720, window.innerWidth - 24)],
      h: [400, Math.max(400, room - 2)],
    };
  }
  function size(w: number, h: number) {
    if (!pop) {
      return;
    }
    const {
      w: [w0, w1],
      h: [h0, h1],
    } = bounds();
    const width = Math.round(Math.min(w1, Math.max(w0, w)));
    const height = Math.round(Math.min(h1, Math.max(h0, h)));
    pop.style.setProperty("--c-panel-w", `${width}px`);
    pop.style.setProperty("--c-caw-panel-h", `${height}px`);
    store("local", KEPT, JSON.stringify({ w: width, h: height }));
  }

  let drag: {
    x: number;
    y: number;
    w: number;
    h: number;
    axes: string;
  } | null = null;
  function down(event: PointerEvent, axes: string) {
    if (!pop || event.button !== 0) {
      return;
    }
    const box = pop.getBoundingClientRect();
    drag = {
      x: event.clientX,
      y: event.clientY,
      w: box.width,
      h: box.height,
      axes,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (!drag) {
      return;
    }
    const w = drag.axes.includes("x")
      ? drag.w + event.clientX - drag.x
      : drag.w;
    const h = drag.axes.includes("y")
      ? drag.h + event.clientY - drag.y
      : drag.h;
    size(w, h);
  }
  function up() {
    drag = null;
  }
  const back = () => size(REST.w, REST.h);

  let wide = $state(false);
  $effect(() => {
    if (!pop) {
      return;
    }
    wide = pop.getBoundingClientRect().width > 470;
    if (mode === "wide") {
      return;
    }
    // The grip and the edges stand against the panel's own box.
    const held = pop.style.position;
    pop.style.position = "relative";
    return () => {
      pop.style.position = held;
    };
  });
</script>

{#if form === "phone"}
  <!-- The sheet has no size to choose. -->
{:else if mode === "wide"}
  <DropdownMenu.CheckboxItem
    checked={wide}
    data-design-wide
    onCheckedChange={(next) => {
      wide = next;
      size(next ? 560 : 380, pop?.getBoundingClientRect().height ?? REST.h);
    }}
  >
    Wide panel
  </DropdownMenu.CheckboxItem>
{:else if mode === "grip"}
  <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle is a focusable-less separator the pointer drags; an <hr> takes no pointer capture -->
  <span
    bind:this={node}
    aria-label="Resize Caw's panel"
    class="grip"
    data-design-grip
    ondblclick={back}
    onlostpointercapture={up}
    onpointerdown={(event) => down(event, "xy")}
    onpointermove={move}
    onpointerup={up}
    role="separator"
  ></span>
{:else}
  <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle the pointer drags, as the grip -->
  <span
    bind:this={node}
    aria-label="Resize Caw's panel's width"
    aria-orientation="vertical"
    class="edge inline"
    data-design-edge="inline"
    ondblclick={back}
    onlostpointercapture={up}
    onpointerdown={(event) => down(event, "x")}
    onpointermove={move}
    onpointerup={up}
    role="separator"
  ></span>
  <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle the pointer drags, as the grip -->
  <span
    aria-label="Resize Caw's panel's height"
    aria-orientation="horizontal"
    class="edge block"
    data-design-edge="block"
    ondblclick={back}
    onlostpointercapture={up}
    onpointerdown={(event) => down(event, "y")}
    onpointermove={move}
    onpointerup={up}
    role="separator"
  ></span>
{/if}

<style>
  /* The house corner grip (DESIGN.md's tokens: c-corner-grip-leg,
     c-corner-grip-stroke, border-control), in a 24px zone (WCAG 2.5.8's
     least target) at the bottom-trailing corner. Its L stands in the
     gutter between the panel's drawn edge and the message box's (the
     panel's --space-2 inset), centred across it and concentric with the
     panel's radius, so it never touches the box's corner. */
  .grip {
    --in: calc((var(--space-2) - var(--c-corner-grip-stroke)) / 2);

    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    z-index: 30;
    inline-size: 24px;
    block-size: 24px;
    cursor: nwse-resize;
    touch-action: none;
  }
  .grip::after {
    content: "";
    position: absolute;
    inset-block-end: var(--in);
    inset-inline-end: var(--in);
    inline-size: var(--c-corner-grip-leg);
    block-size: var(--c-corner-grip-leg);
    border-inline-end: var(--c-corner-grip-stroke) solid var(--border-control);
    border-block-end: var(--c-corner-grip-stroke) solid var(--border-control);
    border-end-end-radius: calc(var(--radius-lg) - var(--in));
    transition: border-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .grip:hover::after,
    .edge:hover::after {
      border-color: var(--ink-muted);
    }
  }
  .edge {
    position: absolute;
    z-index: 30;
    touch-action: none;
  }
  .edge.inline {
    inset-block: var(--space-4);
    inset-inline-end: 0;
    inline-size: var(--space-2);
    cursor: ew-resize;
  }
  .edge.block {
    inset-inline: var(--space-4);
    inset-block-end: 0;
    block-size: var(--space-2);
    cursor: ns-resize;
  }
  /* Each handle's mark: a short line in the control edge at the middle of
     its edge, as a sheet's grab is. */
  .edge::after {
    content: "";
    position: absolute;
    border: 0 solid var(--border-control);
    border-radius: var(--radius-pill);
    transition: border-color var(--dur-control) var(--ease-out);
  }
  .edge.inline::after {
    inset-block: calc(50% - var(--space-4));
    inset-inline-end: 3px;
    border-inline-end-width: 3px;
  }
  .edge.block::after {
    inset-inline: calc(50% - var(--space-4));
    inset-block-end: 3px;
    border-block-end-width: 3px;
  }
</style>
