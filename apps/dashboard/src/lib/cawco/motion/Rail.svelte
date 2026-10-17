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
    stagger,
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
    /** Each item's entrance delay is this many ms per place (`--delay`, read by `ns-in`). */
    stagger?: number;
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
  data-rail-class={className}
  data-slot="rail"
  aria-label={label}
  class="group/rail relative {className}"
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
    data-slot="thumb"
    aria-hidden="true"
    class="pointer-events-none absolute top-0 left-0 h-(--thumb-h) w-(--thumb-w) transform-(--thumb-move) rounded-sm bg-surface-lift opacity-(--thumb-opacity) shadow-raised motion-safe:data-placed:transition-[transform,width,height] motion-safe:data-placed:dur-morph motion-safe:data-placed:ease-in-out"
    data-placed={placed || undefined}
    style:--thumb-h={thumbBox ? `${thumbBox.h}px` : undefined}
    style:--thumb-move={translate(thumbBox, "both")}
    style:--thumb-opacity={thumbBox ? 1 : 0}
    style:--thumb-w={thumbBox ? `${thumbBox.w}px` : undefined}
  ></span>
  {#each items as entry, i (entry.id)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed radio group; a native radio cannot carry the mark, thumb and travelling label -->
    <button
      aria-checked={entry.id === value}
      aria-label={entry.label}
      class="relative cursor-pointer rounded-sm border-none border-current bg-transparent p-0 text-ink-muted transition-[background-color] dur-control ease-out hover:enabled:aria-checked-false:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 aria-checked:text-ink-strong {itemClass}"
      data-rail-item-class={itemClass}
      data-rail-item={entry.id}
      disabled={entry.disabled}
      onclick={() => onpick(entry.id)}
      onfocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          tip = i;
        }
      }}
      role="radio"
      style:--delay={stagger === undefined ? undefined : `${i * stagger}ms`}
      tabindex={entry.id === value ? 0 : -1}
      type="button"
    >
      {@render item(entry, i)}
    </button>
  {/each}
  {#if !labelled}
    <!-- One label for the whole rail: beside a vertical rail, under a
         horizontal one. -->
    <!-- literal: calc(100% + 6px) -->
    <span
      data-slot="tip"
      aria-hidden="true"
      class="pointer-events-none absolute top-0 left-0 z-5 flex h-(--tip-h) w-(--tip-w) transform-(--tip-move) items-center overflow-hidden rounded-sm bg-ink-strong text-neutral-2 opacity-(--tip-opacity) shadow-raised transition-[opacity] dur-control ease-out group-axis-x/rail:top-(--tip-top) group-axis-y/rail:left-(--tip-left)"
      style:--tip-h={tipBox ? `${tipBox.h}px` : undefined}
      style:--tip-left="calc(100% + 6px)"
      style:--tip-move={translate(tipBox, axis)}
      style:--tip-opacity={tip >= 0 ? 1 : 0}
      style:--tip-top="calc(100% + 6px)"
      style:--tip-w="{tipWidth}px"
    >
      {#key shownTip}
        <!-- literal: 6px -->
        <!-- literal: 10px -->
        <span
          data-slot="tip-text"
          class="inline-flex items-center gap-(--gap) px-(--pad) font-body text-size-meta leading-none font-normal whitespace-nowrap"
          bind:offsetWidth={tipWidth}
          style:--gap="6px"
          style:--pad="10px"
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
  /* residual: unmapped — the tip's three properties glide over different durations (needs transition token: transform/width var(--dur-morph) var(--ease-in-out), opacity var(--dur-control) var(--ease-out)) */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="tip"] {
      transition:
        transform var(--dur-morph) var(--ease-in-out),
        width var(--dur-morph) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }

  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="tip-text"] {
      animation: rail-label-in var(--dur-exit) var(--ease-out) both;
    }
  }
</style>
