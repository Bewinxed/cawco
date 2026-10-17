<script lang="ts">
  /**
   * TODAY (main): Caw can't start, as ThreadPane's `.off` draws it where the
   * composer would stand: the kit Alert on the composer's edge, radius and
   * tile shadow, the hub's sentence, and Check machines as the kit's
   * outline small button in the Alert's action slot.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let { words }: { words: string } = $props();
</script>

<Alert
  class="items-center rounded-lg border border-[var(--border-control)] bg-[var(--surface-raised)] shadow-[var(--shadow-tile)]"
  role="status"
>
  <AlertDescription>{words}</AlertDescription>
  <AlertAction class="inset-y-0 flex items-center">
    <Button label="Check machines" size="sm" variant="outline" />
  </AlertAction>
</Alert>
