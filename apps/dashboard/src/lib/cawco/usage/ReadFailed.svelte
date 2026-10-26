<script lang="ts">
  /**
   * A usage block whose read failed: what could not be read, and Retry,
   * which runs while it reads again.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";

  let { said, read }: { said: string; read: () => Promise<void> } = $props();

  let retrying = $state(false);

  async function retry(): Promise<void> {
    retrying = true;
    await read();
    retrying = false;
  }
</script>

<div
  data-slot="failed"
  class="flex flex-wrap items-center gap-space-3"
  role="alert"
>
  <p data-slot="note" class="type-meta text-ink-muted">{said}</p>
  <Button
    icon={IconRefresh}
    label="Retry"
    onclick={retry}
    pending={retrying}
    pendingLabel="Retrying…"
    size="sm"
    variant="outline"
  />
</div>
