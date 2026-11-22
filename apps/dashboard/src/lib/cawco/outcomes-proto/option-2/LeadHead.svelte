<script lang="ts">
  /**
   * A lead's head: what is open, said once, as its title; More, when the
   * lead has acts beyond reading; and Close, which returns the bento to its
   * even reading (option 2, decision 3). Close is a symbol named by where it
   * goes (DESIGN.md, Title bars: Back and Close are symbols).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconMoreLinear } from "#lib/icons.js";

  let {
    title,
    more = [],
    onclose,
  }: {
    title: string;
    /** More's items, each its words and its act. */
    more?: { label: string; run: () => void }[];
    onclose: () => void;
  } = $props();
</script>

<div class="flex min-w-0 items-start gap-space-2" data-slot="lead-head">
  <h2 class="min-w-0 flex-1 pt-space-1 type-title text-ink-strong">{title}</h2>
  {#if more.length > 0}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="More for {title}"
        size="icon-sm"
        variant="ghost"
      >
        <IconMoreLinear />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" width="regular">
        {#each more as item (item.label)}
          <DropdownMenu.Item onSelect={item.run}>{item.label}</DropdownMenu.Item
          >
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
  <Tip label="Close, back to every outcome">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Close, back to every outcome"
        icon={IconClose}
        onclick={onclose}
        size="icon-sm"
        variant="ghost"
      />
    {/snippet}
  </Tip>
</div>
