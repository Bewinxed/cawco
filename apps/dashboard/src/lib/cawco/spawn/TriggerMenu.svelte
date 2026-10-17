<script lang="ts">
  /** The `@` / `/` menu (§2.3): caret-anchored, keyboard-driven, 300px wide. */
  import NsPopover from "./NsPopover.svelte";
  import type { MenuItem } from "./ns-types";

  let {
    id,
    open,
    anchor,
    items,
    index,
    onpick,
    onchange,
  }: {
    id: string;
    open: boolean;
    anchor: { getBoundingClientRect: () => DOMRect } | null;
    items: MenuItem[];
    index: number;
    onpick: (item: MenuItem) => void;
    onchange: (open: boolean) => void;
  } = $props();
</script>

<NsPopover
  {anchor}
  aria-label="Insert"
  gap={2}
  {id}
  {onchange}
  {open}
  rows="[data-fh]"
  trapFocus={false}
  width={300}
>
  <!-- literal: 4px inset, 36px height, 38px row pitch -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute top-space-1 right-space-1 left-space-1 h-(--h) transform-(--shift) rounded-sm bg-surface-fill opacity-(--o) motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-in-out"
    style:--h="36px"
    style:--o={items.length ? 1 : 0}
    style:--shift={`translateY(calc(${index} * 38px))`}
  ></span>
  {#each items as item (item.key)}
    {@const Icon = item.icon}
    <!-- literal: 9px gap, 36px height, 8px inline padding, 22px tile -->
    <button
      data-slot="row"
      class="press-tint relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) text-left text-ink-strong"
      data-fh="1"
      onmousedown={(event) => {
        event.preventDefault();
        onpick(item);
      }}
      style:--gap="9px"
      style:--h="36px"
      style:--pad-x="8px"
      tabindex="-1"
      type="button"
    >
      <span
        data-slot="tile"
        class="ns-tile size-(--tile) rounded-xs text-(--hue)"
        style:--hue={item.hue}
        style:--tile="22px"><Icon class="size-icon-sm" /></span
      >
      <span
        data-slot="trigger-menu-label"
        class="min-w-0 flex-1 truncate font-body text-size-label leading-(--lh) font-medium"
        style:--lh="1.2">{item.label}</span
      >
      <span data-slot="kind" class="type-meta whitespace-nowrap text-ink-subtle"
        >{item.kind}</span
      >
    </button>
  {/each}
  {#if items.length === 0}
    <!-- literal: 10px 8px padding -->
    <div
      class="type-meta px-(--pad-x) py-(--pad-y) text-ink-subtle"
      style:--pad-x="8px"
      style:--pad-y="10px"
    >
      No matches
    </div>
  {/if}
</NsPopover>

<style>
  /* residual: foreign-dom */
  :global(#trigger-menu-popover.ns-pop) {
    padding: var(--space-1);
  }
</style>
