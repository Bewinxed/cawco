<script lang="ts">
  /**
   * A place's bar, on Apple's toolbar model as Liquid Glass revised it
   * (DESIGN.md, The Title Bars Follow Liquid Glass Rule): one row, no ground;
   * under the desk line a leading glass group holding the places symbol;
   * the place's short name; a trailing glass group of bare symbols ending
   * in More; then the one prominent action. More holds the project's rare
   * acts, which open the Configure sheet; a place may put its own first
   * (Tasks' Select tasks).
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import type { Component, Snippet } from "svelte";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMore, IconSidebar } from "#lib/icons.js";

  let {
    title,
    action,
    symbols,
    more = [],
    onplaces,
    onconfigure,
    moreOpen = false,
  }: {
    title: string;
    /** The one prominent action, trailing. */
    action?: { label: string; icon: Component; onclick: () => void };
    /** The trailing group's bare symbols, before More. */
    symbols?: Snippet;
    /** The place's own acts, first under More. */
    more?: { label: string; onclick: () => void }[];
    onplaces: () => void;
    onconfigure: () => void;
    /** More's menu stands open. */
    moreOpen?: boolean;
  } = $props();

  // Open from the story's state, until a press shuts it (follows-props).
  let open = $derived(moreOpen);

  const RARE = [w.setUp, w.placesWiring, w.spendCap, w.forget, w.delete];
</script>

<header
  class="relative flex h-c-top-bar-h flex-none items-center gap-space-3 ps-space-7 pe-space-6 max-desk:ps-c-bar-phone-edge max-desk:pe-c-bar-phone-edge"
>
  <div class="desk:hidden">
    <BarGlass form="group">
      <Tip label={w.openPlaces}>
        {#snippet children(props)}
          <button
            {...props}
            data-bar-item
            type="button"
            class="select-none touch-hit press-tint"
            aria-label={w.openPlaces}
            onclick={onplaces}
          >
            <IconSidebar data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    </BarGlass>
  </div>
  <h1 class="min-w-0 flex-1 truncate type-title text-ink-strong">{title}</h1>
  <BarGlass form="group">
    {@render symbols?.()}
    <DropdownMenu.Root bind:open>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            data-bar-item
            type="button"
            class="select-none touch-hit press-tint"
            aria-label={w.more}
          >
            <IconMore data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        portalProps={{ disabled: true }}
        width="wide"
      >
        {#each more as item (item.label)}
          <DropdownMenu.Item onSelect={item.onclick}
            >{item.label}</DropdownMenu.Item
          >
        {/each}
        {#if more.length > 0}
          <DropdownMenu.Separator />
        {/if}
        {#each RARE as label (label)}
          <DropdownMenu.Item onSelect={onconfigure}>{label}</DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </BarGlass>
  {#if action}
    <Button
      label={action.label}
      icon={action.icon}
      size="sm"
      onclick={action.onclick}
    />
  {/if}
</header>
