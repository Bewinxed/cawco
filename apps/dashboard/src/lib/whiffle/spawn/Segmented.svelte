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
  class={`segmented ${size} ${className}`}
  onkeydown={keydown}
  role="radiogroup"
  style={`--n:${items.length}`}
  tabindex="-1"
>
  <span
    aria-hidden="true"
    class="thumb"
    style={`transform:translateX(calc(${index} * (100% + 2px)))`}
  ></span>
  {#each items as item (item.value)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a designed segmented control with a sliding thumb; native radios cannot render it -->
    <button
      aria-checked={item.value === value}
      class="tab press-tint"
      onclick={() => onchange(item.value)}
      role="radio"
      tabindex={item.value === value ? 0 : -1}
      title={item.label}
      type="button"
      class:on={item.value === value}
    >
      {#if icon}
        {@render icon(item.value, item.value === value)}
      {/if}
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    background: var(--surface-recess-deep);
    border-radius: var(--radius-md);
  }
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px - (var(--n) - 1) * 2px) / var(--n));
    background: var(--surface-lift);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-raised);
    transition: transform var(--ns-thumb-ms) var(--ease-in-out);
    pointer-events: none;
  }
  .tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    font: 500 var(--text-label) / 1 var(--font-body);
    color: var(--ink-muted);
    cursor: pointer;
    white-space: nowrap;
    min-width: 0;
  }
  .tab span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .md .tab {
    height: 30px;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  .tab.on {
    color: var(--ink-strong);
  }
  .tab :global(svg) {
    flex: none;
  }
  @media (max-width: 640px) {
    .tab {
      height: 38px;
    }
  }
</style>
