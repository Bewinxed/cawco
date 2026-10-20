<script lang="ts">
  /** The `@` / `/` menu (§2.3): caret-anchored, keyboard-driven, 300px wide. */
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
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
  pad="snug"
  rows="[data-fh]"
  trapFocus={false}
  width={300}
>
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-space-1 top-space-1 h-c-btn-h translate-y-(--fill-y) rounded-sm bg-surface-fill opacity-0 data-shown:opacity-100 motion-safe:transition-[translate] motion-safe:dur-control motion-safe:ease-in-out"
    data-shown={items.length > 0 || undefined}
    style:--fill-y={`calc(${index} * (var(--c-btn-h) + var(--space-row)))`}
  ></span>
  {#each items as item (item.key)}
    {@const Icon = item.icon}
    <button
      data-slot="row"
      class="press-tint transition-control relative flex h-c-btn-h w-full cursor-pointer items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-2 text-start text-ink-strong"
      data-fh="1"
      onmousedown={(event) => {
        event.preventDefault();
        onpick(item);
      }}
      tabindex="-1"
      type="button"
    >
      <span data-slot="tile" class={iconTileVariants()} style:color={item.hue}
        ><Icon class="size-icon-md" /></span
      >
      <span
        data-slot="trigger-menu-label"
        class="type-label min-w-0 flex-1 truncate">{item.label}</span
      >
      <span data-slot="kind" class="type-meta whitespace-nowrap text-ink-subtle"
        >{item.kind}</span
      >
    </button>
  {/each}
  {#if items.length === 0}
    <div class="type-meta px-space-2 py-space-3 text-ink-subtle">
      No matches
    </div>
  {/if}
</NsPopover>
