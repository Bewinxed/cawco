<script lang="ts">
  /**
   * The acts that settle Caw's suggestion, edged peers in one row: Add
   * this outcome, Change this outcome with Caw where it is opened, and
   * Drop this suggestion. Each waits while the hub is unreachable, saying
   * so in its tooltip.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { words } from "./words";

  let {
    offline,
    ontake,
    ondismiss,
    onreword = null,
  }: {
    offline: string | null;
    ontake: () => void;
    ondismiss: () => void;
    /** Opens Caw's conversation to change it; null where it is not opened. */
    onreword?: (() => void) | null;
  } = $props();

  const acts = $derived(
    [
      { label: words.take, run: ontake },
      onreword ? { label: words.reword, run: onreword } : null,
      { label: words.dismiss, run: ondismiss },
    ].filter((one) => one !== null)
  );
</script>

<div class="flex min-w-0 flex-wrap items-center gap-space-2">
  {#each acts as one (one.label)}
    <Button
      disabled={offline !== null}
      label={one.label}
      onclick={one.run}
      size="sm"
      title={offline ?? undefined}
      variant="outline"
    />
  {/each}
</div>
