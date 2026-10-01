<script lang="ts" module>
  export interface RailItem {
    disabled?: boolean;
    id: string;
    /** Its name: the radio's accessible name and the travelling label. */
    label: string;
  }
</script>

<script generics="Item extends RailItem" lang="ts">
  /**
   * A designed radio group: a thumb that slides under the chosen item, and
   * one label that travels to whichever item is under the pointer or the
   * keyboard and re-sizes to its name, rather than a tooltip per item
   * popping in and out. Arrow keys move the choice among the enabled items.
   * It lies along either axis: down the new-session dialog's harness rail,
   * across the home's Working/Finished switch.
   *
   * The thumb and the label are placed from the items' own boxes, so items
   * of any size work; both glide over --dur-morph on --ease-in-out (with
   * less motion they move at once and only the label's fade runs).
   */
  import type { Snippet } from "svelte";

  let {
    items,
    value,
    onpick,
    axis,
    label,
    class: className = "",
    itemClass = "",
    itemStyle,
    item,
    tipExtra,
    labelled = false,
  }: {
    items: Item[];
    value: string;
    onpick: (id: string) => void;
    axis: "x" | "y";
    /** The group's accessible name. */
    label: string;
    class?: string;
    itemClass?: string;
    itemStyle?: (index: number) => string;
    /** What an item draws: its mark, and whatever else it carries. */
    item: Snippet<[Item, number]>;
    /** Said after the name in the travelling label ("soon"). */
    tipExtra?: Snippet<[Item]>;
    /** The items show their names already: no travelling label to repeat them. */
    labelled?: boolean;
  } = $props();

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  let root = $state<HTMLDivElement>();
  let boxes = $state<Box[]>([]);
  /** The thumb glides only once it has been placed: never in from 0,0. */
  let placed = $state(false);

  function measure() {
    if (!root) {
      return;
    }
    boxes = [...root.querySelectorAll<HTMLElement>("[data-rail-item]")].map(
      (node) => ({
        x: node.offsetLeft,
        y: node.offsetTop,
        w: node.offsetWidth,
        h: node.offsetHeight,
      })
    );
  }

  $effect(() => {
    // Re-measured when the items change and whenever any of them resizes
    // (a count growing a digit widens its tab).
    if (!root || items.length === 0) {
      return;
    }
    measure();
    const sizes = new ResizeObserver(measure);
    for (const node of root.querySelectorAll("[data-rail-item]")) {
      sizes.observe(node);
    }
    const frame = requestAnimationFrame(() => {
      placed = true;
    });
    return () => {
      sizes.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  const chosen = $derived(items.findIndex((entry) => entry.id === value));
  const thumbBox = $derived(boxes[chosen]);

  /** The item under the pointer or keyboard focus; `shownTip` keeps the last
      one so the label fades out where it was instead of jumping. */
  let tip = $state(-1);
  let shownTip = $state(0);
  let tipWidth = $state(0);
  $effect(() => {
    if (tip >= 0) {
      shownTip = tip;
    }
  });
  const tipBox = $derived(boxes[shownTip]);

  /** Which item the pointer is over, gaps counting toward the one before. */
  function railMove(event: MouseEvent) {
    if (!root) {
      return;
    }
    const box = root.getBoundingClientRect();
    const at =
      axis === "y"
        ? event.clientY - box.top - root.clientTop
        : event.clientX - box.left - root.clientLeft;
    let hit = -1;
    boxes.forEach((entry, index) => {
      if ((axis === "y" ? entry.y : entry.x) <= at) {
        hit = index;
      }
    });
    const last = boxes.at(-1);
    if (
      hit === boxes.length - 1 &&
      last &&
      at > (axis === "y" ? last.y + last.h : last.x + last.w)
    ) {
      hit = -1;
    }
    tip = hit;
  }

  function tabKey(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ];
    if (!step) {
      return;
    }
    event.preventDefault();
    const enabled = items.filter((entry) => !entry.disabled);
    const at = enabled.findIndex((entry) => entry.id === value);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    if (next) {
      onpick(next.id);
      (event.currentTarget as HTMLElement)
        .querySelector<HTMLButtonElement>(
          `[data-rail-item="${CSS.escape(next.id)}"]`
        )
        ?.focus();
    }
  }

  const translate = (box: Box | undefined, along: "x" | "y" | "both") => {
    if (!box) {
      return "none";
    }
    const x = along === "y" ? 0 : box.x;
    const y = along === "x" ? 0 : box.y;
    return `translate(${x}px, ${y}px)`;
  };
</script>

<div
  aria-label={label}
  class="rail {className}"
  data-axis={axis}
  onfocusout={() => {
    tip = -1;
  }}
  onkeydown={tabKey}
  onmouseleave={() => {
    tip = -1;
  }}
  onmousemove={railMove}
  role="radiogroup"
  tabindex="-1"
  bind:this={root}
>
  <span
    aria-hidden="true"
    class="thumb"
    data-placed={placed || undefined}
    style:height={thumbBox ? `${thumbBox.h}px` : undefined}
    style:opacity={thumbBox ? 1 : 0}
    style:transform={translate(thumbBox, 'both')}
    style:width={thumbBox ? `${thumbBox.w}px` : undefined}
  ></span>
  {#each items as entry, i (entry.id)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed radio group; a native radio cannot carry the mark, thumb and travelling label -->
    <button
      aria-checked={entry.id === value}
      aria-label={entry.label}
      class="rail-item {itemClass}"
      data-rail-item={entry.id}
      disabled={entry.disabled}
      onclick={() => onpick(entry.id)}
      onfocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) {
          tip = i;
        }
      }}
      role="radio"
      style={itemStyle?.(i)}
      tabindex={entry.id === value ? 0 : -1}
      type="button"
      class:on={entry.id === value}
    >
      {@render item(entry, i)}
    </button>
  {/each}
  {#if !labelled}
    <span
      aria-hidden="true"
      class="tip"
      style:height={tipBox ? `${tipBox.h}px` : undefined}
      style:opacity={tip >= 0 ? 1 : 0}
      style:transform={translate(tipBox, axis)}
      style:width="{tipWidth}px"
    >
      {#key shownTip}
        <span class="tip-text" bind:offsetWidth={tipWidth}
          >{items[shownTip]?.label}
          {#if tipExtra && items[shownTip]}
            {@render tipExtra(items[shownTip])}
          {/if}</span
        >
      {/key}
    </span>
  {/if}
</div>

<style>
  .rail {
    position: relative;
  }
  .thumb {
    position: absolute;
    top: 0;
    left: 0;
    background: var(--surface-lift);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-raised);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .thumb[data-placed] {
      transition:
        transform var(--dur-morph) var(--ease-in-out),
        width var(--dur-morph) var(--ease-in-out),
        height var(--dur-morph) var(--ease-in-out);
    }
  }
  .rail-item {
    position: relative;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-muted);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .rail-item.on {
    color: var(--ink-strong);
  }
  @media (hover: hover) {
    .rail-item:not(.on):not(:disabled):hover {
      background: var(--surface-hover);
    }
  }
  .rail-item:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  /* One label for the whole rail: beside a vertical rail, under a
     horizontal one. */
  .tip {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    overflow: hidden;
    background: var(--ink-strong);
    color: var(--neutral-2, #fff);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-raised);
    pointer-events: none;
    transition: opacity var(--dur-control) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform var(--dur-morph) var(--ease-in-out),
        width var(--dur-morph) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }
  .rail[data-axis="y"] > .tip {
    left: calc(100% + 6px);
  }
  .rail[data-axis="x"] > .tip {
    top: calc(100% + 6px);
  }
  .tip-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    font: var(--weight-body) var(--text-meta) / 1 var(--font-body);
    white-space: nowrap;
    @media (prefers-reduced-motion: no-preference) {
      animation: rail-label-in var(--dur-exit) var(--ease-out) both;
    }
  }
</style>
