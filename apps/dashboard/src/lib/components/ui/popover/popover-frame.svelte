<script lang="ts">
  /**
   * The kit's Popover in a frame of its own (its states file's): open under
   * its trigger, drawn in place (the portal off) in a box that holds it
   * (`contain: layout`, so floating-ui places it in the frame), under the
   * kit's Button as its trigger and holding the kit's Command list, as the
   * model combobox composes them: its rows are the kit's items on the menu
   * item recipe (DESIGN.md, Menu item).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";

  let {
    rows,
    height,
  }: {
    /** The popover's rows, each its words. */
    rows: string[];
    /** The frame's least height, px: room for the popover under its trigger. */
    height: number;
  } = $props();
</script>

<div
  class="relative min-h-(--frame-h) p-space-4 contain-layout"
  style:--frame-h={`${height}px`}
>
  <Popover.Root open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline">Open</Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      align="start"
      forceMount
      onOpenAutoFocus={(event) => event.preventDefault()}
      pad="none"
      portalProps={{ disabled: true }}
      avoidCollisions={false}
      side="bottom"
      strategy="absolute"
      trapFocus={false}
    >
      <Command.Root>
        <Command.List>
          {#each rows as row (row)}
            <Command.Item value={row}>{row}</Command.Item>
          {/each}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>
