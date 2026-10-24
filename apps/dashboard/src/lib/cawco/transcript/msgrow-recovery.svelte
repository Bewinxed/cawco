<script lang="ts">
  /**
   * A failed send's way back, at rest under its words in the well, the same
   * in all three message-row drawings: why, in the fail ink, then Retry,
   * Edit and Remove as the kit's outline buttons (MessageRow's failure
   * block). While it stands, the message has no hover-only control.
   */
  import { Button } from "#lib/components/ui/button/index.js";

  let { reason }: { reason: string } = $props();
</script>

<div data-slot="failure" class="mt-space-2">
  <p
    data-slot="reason"
    class="text-size-meta font-normal text-status-fail-ink text-pretty"
  >
    {reason}
  </p>
  <div
    data-slot="actions"
    class="flex flex-wrap gap-space-2 mt-space-2 min-w-0"
  >
    <Button data-slot="action" size="xs" variant="outline">Retry</Button>
    <Button data-slot="action" size="xs" variant="outline">Edit</Button>
    <Button data-slot="action" size="xs" variant="outline">Remove</Button>
  </div>
</div>
