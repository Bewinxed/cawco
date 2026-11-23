<script lang="ts">
  /**
   * Spacing as it is used: real kit pieces at their own spacing, every
   * padding and gap a step of the 4px scale. Measuring one is the design
   * graph's own guides'.
   */
  import AlertFrame from "#lib/components/ui/alert/alert-frame.svelte";
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";
  import { IconInfo } from "#lib/icons.js";
</script>

<div class="grid gap-space-6 @desk:grid-cols-2">
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">A list of rows</figcaption>
    <RowFrame withBelow />
  </figure>
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-tx-2 type-meta">A notice</figcaption>
    <AlertFrame
      action="Restart now"
      icon={IconInfo}
      line="The daemon restarts in about a minute; nothing running is lost."
      title="Sessions on obelisk pause while it updates"
    />
  </figure>
</div>
