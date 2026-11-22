<script lang="ts">
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconTick } from "#lib/icons.js";

  interface Props {
    askOpen: boolean;
    notice: string | null;
    stale: boolean;
  }

  let { askOpen, notice = $bindable(), stale }: Props = $props();
</script>

{#if stale}
  <Alert variant="warning">
    <AlertDescription>
      This is the last reading from the hub, so it may be out of date. Changes
      wait until the hub is back.
    </AlertDescription>
  </Alert>
{/if}

{#if notice && !askOpen}
  <Alert layout="row" surface="card" variant="default">
    <IconTick class="text-status-done-glyph" />
    <AlertDescription>{notice}</AlertDescription>
    <Button
      aria-label="Dismiss ask notice"
      icon={IconClose}
      onclick={() => {
        notice = null;
      }}
      size="icon-xs"
      tone="quiet"
      variant="ghost"
    />
  </Alert>
{/if}
