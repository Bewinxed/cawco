<script generics="T extends string" lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/utils.js";
  /** Two-or-more tab segmented control with a sliding thumb (§1.5, §1.9). */
  import { arrowStep } from "../roving";

  let {
    items,
    value,
    onchange,
    label,
    size = "sm",
    icon,
    class: className = "",
  }: {
    items: { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
    label: string;
    size?: "sm" | "md";
    icon?: Snippet<[T, boolean]>;
    class?: string;
  } = $props();
  const index = $derived(
    Math.max(
      0,
      items.findIndex((item) => item.value === value)
    )
  );
  function keydown(event: KeyboardEvent) {
    const to = arrowStep(event, index, items.length);
    if (to === null) {
      return;
    }
    onchange(items[to].value);
    (event.currentTarget as HTMLElement)
      .querySelectorAll<HTMLButtonElement>("button")
      [to]?.focus();
  }
</script>

<div
  aria-label={label}
  class={cn(
    "relative grid grid-cols-(--cols) gap-space-row rounded-md concentric-in r-outer-md r-inset-space-1 bg-surface-recess-deep p-space-1",
    className
  )}
  data-segmented-size={size}
  onkeydown={keydown}
  role="radiogroup"
  style:--cols="repeat(var(--n), minmax(0, 1fr))"
  style:--n={items.length}
  tabindex="-1"
>
  <span
    data-slot="thumb"
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-space-1 start-space-1 w-(--thumb-w) translate-x-(--thumb-x) concentric-sm bg-surface-lift shadow-raised motion-safe:transition-[translate] motion-safe:duration-(--dur-pop) motion-safe:ease-in-out"
    style:--thumb-w={"calc((100% - 2 * var(--space-1) - (var(--n) - 1) * var(--space-row)) / var(--n))"}
    style:--thumb-x={`calc(${index} * (100% + var(--space-row)))`}
  ></span>
  {#each items as item (item.value)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed segmented control with a sliding thumb; native radios cannot render it -->
    <button
      data-slot="tab"
      aria-checked={item.value === value}
      class={[
        "press-tint transition-control relative inline-flex select-none min-w-0 items-center justify-center gap-space-2 concentric-sm border-none border-current bg-transparent px-space-3 font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-muted aria-checked:text-ink-strong [&_svg]:flex-none",
        size === "md" ? "h-c-btn-h-sm" : "h-c-btn-h-xs max-phone:h-c-btn-h",
      ]}
      onclick={() => onchange(item.value)}
      role="radio"
      tabindex={item.value === value ? 0 : -1}
      title={item.label}
      type="button"
    >
      {#if icon}
        {@render icon(item.value, item.value === value)}
      {/if}
      <span class="min-w-0 truncate">{item.label}</span>
    </button>
  {/each}
</div>
