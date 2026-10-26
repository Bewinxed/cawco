<script lang="ts">
  /**
   * A write popover's foot: why the hub refused the ask, when it did, over
   * the submit, which runs while the ask is under way (`pending`) and is
   * disabled, saying why as its title, while the hub cannot take a write
   * (`down`) or the form is not ready.
   */
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    failed,
    down,
    ready,
    pending,
    label,
    pendingLabel,
  }: {
    failed: string | null;
    down: string | null;
    ready: boolean;
    pending: boolean;
    label: string;
    pendingLabel: string;
  } = $props();
</script>

{#if failed}
  <p
    data-slot="refused"
    class="type-meta wrap-anywhere text-status-fail-ink"
    role="alert"
    transition:unfold
  >
    {failed}
  </p>
{/if}
<Button
  class="self-end"
  disabled={down !== null || !ready}
  failed={failed !== null}
  {label}
  {pending}
  {pendingLabel}
  title={down ?? undefined}
  type="submit"
/>
