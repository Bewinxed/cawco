<script generics="T extends string" lang="ts">
  /** Two-or-more tab segmented control with a sliding thumb (§1.5, §1.9). */
  import type { Snippet } from "svelte";

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
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = items[(index + step + items.length) % items.length];
    onchange(next.value);
    (event.currentTarget as HTMLElement)
      .querySelectorAll<HTMLButtonElement>("button")
      [(index + step + items.length) % items.length]?.focus();
  }
</script>

<!-- literal: 3px padding, tab heights 26px / 30px / 38px -->
<div
  aria-label={label}
  class={[
    "relative grid grid-cols-(--cols) gap-space-row rounded-md bg-surface-recess-deep p-(--pad)",
    className,
  ]}
  data-segmented-size={size}
  onkeydown={keydown}
  role="radiogroup"
  style:--cols="repeat(var(--n), minmax(0, 1fr))"
  style:--n={items.length}
  style:--pad="3px"
  style:--tab-h={size === "md" ? "30px" : "26px"}
  style:--tab-h-phone={size === "md" ? "30px" : "38px"}
  tabindex="-1"
>
  <span
    data-slot="thumb"
    aria-hidden="true"
    class="pointer-events-none absolute top-(--pad) bottom-(--pad) left-(--pad) w-(--thumb-w) transform-(--shift) rounded-sm bg-surface-lift shadow-raised transition-[transform] duration-(--ns-thumb-ms) ease-in-out"
    style:--pad="3px"
    style:--shift={`translateX(calc(${index} * (100% + 2px)))`}
    style:--thumb-w="calc((100% - 6px - (var(--n) - 1) * 2px) / var(--n))"
  ></span>
  {#each items as item (item.value)}
    <!-- literal: 6px gap, 10px inline padding -->
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed segmented control with a sliding thumb; native radios cannot render it -->
    <button
      data-slot="tab"
      aria-checked={item.value === value}
      class="press-tint relative inline-flex h-(--tab-h) max-phone:h-(--tab-h-phone) min-w-0 cursor-pointer items-center justify-center gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-muted aria-checked:text-ink-strong"
      onclick={() => onchange(item.value)}
      role="radio"
      style:--gap="6px"
      style:--pad-x="10px"
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

<style>
  /* residual: foreign-dom */
  [data-slot="tab"] :global(svg) {
    flex: none;
  }
</style>
