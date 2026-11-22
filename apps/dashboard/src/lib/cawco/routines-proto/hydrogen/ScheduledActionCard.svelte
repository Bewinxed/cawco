<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import type { ApprovedAction } from "./routines-data";
  import ServiceMark from "./ServiceMark.svelte";

  let {
    action,
    stale = false,
    oncancel,
  }: {
    action: ApprovedAction;
    oncancel: (actionId: string) => void;
    stale?: boolean;
  } = $props();
</script>

<div
  class="flex flex-col gap-space-1 rounded-sm border border-border-hairline bg-surface-well px-space-3 py-space-2"
  data-scheduled-action={action.id}
>
  <div
    class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1"
  >
    <div
      class="mark-line flex min-w-0 flex-1 flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta text-ink-strong"
    >
      <ServiceMark service={action.service} size="sm" />
      <span class="min-w-0 wrap-anywhere">{action.sentence}</span>
      <span aria-hidden="true" class="text-ink-subtle">·</span>
      <span class="flex-none text-ink-muted tabular-nums">
        {action.whenLabel}
      </span>
    </div>
    <Button
      disabled={stale}
      label="Cancel"
      onclick={() => oncancel(action.id)}
      size="xs"
      variant="outline"
    />
  </div>
  <ExactCallDisclosure {action} />
</div>
