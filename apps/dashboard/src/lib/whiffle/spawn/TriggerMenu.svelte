<script lang="ts">
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
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
  trapFocus={false}
  width={300}
  {@attach highlight({ rows: "[data-fh]" })}
>
  <span
    aria-hidden="true"
    class="hi"
    style={`transform:translateY(calc(${index} * 38px));opacity:${items.length ? 1 : 0}`}
  ></span>
  {#each items as item, i (item.key)}
    {@const Icon = item.icon}
    <button
      class="row"
      data-fh="1"
      onmousedown={(event) => { event.preventDefault(); onpick(item); }}
      tabindex="-1"
      type="button"
      class:active={i === index}
    >
      <span class="ns-tile tile" style={`color:${item.hue}`}><Icon /></span>
      <span class="label">{item.label}</span>
      <span class="kind">{item.kind}</span>
    </button>
  {/each}
  {#if items.length === 0}
    <div class="none">No matches</div>
  {/if}
</NsPopover>

<style>
  :global(#trigger-menu-popover.ns-pop) {
    padding: 4px;
  }
  .hi {
    position: absolute;
    left: 4px;
    right: 4px;
    top: 4px;
    height: 36px;
    background: var(--surface-fill);
    border-radius: var(--radius-sm);
    transition: transform 120ms var(--ease-in-out);
    pointer-events: none;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 36px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--ink-strong);
  }
  .tile {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
  }
  .tile :global(svg) {
    width: 13px;
    height: 13px;
  }
  .label {
    flex: 1;
    min-width: 0;
    font: 500 var(--text-label) / 1.2 var(--font-body);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kind {
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
  }
  .none {
    padding: 10px 8px;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
</style>
