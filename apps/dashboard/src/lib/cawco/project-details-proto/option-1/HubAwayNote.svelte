<script lang="ts">
  /**
   * At the head of an opened subject while the hub is out of reach: what
   * shows was read at that time, and changes cannot be sent.
   */
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { IconCloudCross } from "#lib/icons.js";
  import { words } from "./words";

  let { asOf }: { asOf: string | null } = $props();
</script>

{#if asOf}
  <Alert layout="row">
    <IconCloudCross aria-hidden="true" />
    <AlertDescription>{words.hub.outOfReachNotice(asOf)}</AlertDescription>
  </Alert>
{/if}
