<script lang="ts">
  /**
   * More: a bare symbol opening the kit's menu at its trailing edge, its
   * items the caller's (the head's moves and links, a to-do's Make a task).
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore } from "#lib/icons.js";

  let { children }: { children: Snippet } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-label={words.more}
        icon={IconMore}
        size="icon-sm"
        title={words.more}
        variant="ghost"
      />
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" width="regular">
    {@render children()}
  </DropdownMenu.Content>
</DropdownMenu.Root>
