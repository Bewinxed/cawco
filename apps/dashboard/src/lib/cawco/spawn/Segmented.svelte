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

<div
  aria-label={label}
  class={[
    "relative grid grid-cols-(--cols) gap-space-row rounded-md bg-surface-recess-deep p-space-1",
    className,
  ]}
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
    class="pointer-events-none absolute inset-y-space-1 start-space-1 w-(--thumb-w) translate-x-(--thumb-x) rounded-sm bg-surface-lift shadow-raised motion-safe:transition-[translate] motion-safe:dur-pop motion-safe:ease-in-out"
    style:--thumb-w={"calc((100% - 2 * var(--space-1) - (var(--n) - 1) * var(--space-row)) / var(--n))"}
    style:--thumb-x={`calc(${index} * (100% + var(--space-row)))`}
  ></span>
  {#each items as item (item.value)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed segmented control with a sliding thumb; native radios cannot render it -->
    <button
      data-slot="tab"
      aria-checked={item.value === value}
      class={[
        "press-tint relative inline-flex min-w-0 items-center justify-center gap-space-2 rounded-sm border-none border-current bg-transparent px-space-3 font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-muted aria-checked:text-ink-strong",
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
