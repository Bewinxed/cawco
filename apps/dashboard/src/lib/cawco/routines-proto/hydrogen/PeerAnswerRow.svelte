<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconTick } from "#lib/icons.js";

  let {
    disabled = false,
    ondeny,
    onapprove,
  }: {
    disabled?: boolean;
    onapprove: () => void;
    ondeny: () => void;
  } = $props();
</script>

<div class="flex items-center justify-between gap-space-2 pt-space-1">
  <Button
    answer="deny"
    {disabled}
    hit="always"
    icon={IconClose}
    label="Deny"
    onclick={ondeny}
    size="sm"
    variant="secondary"
  />
  <Button
    answer="approve"
    {disabled}
    hit="always"
    icon={IconTick}
    label="Approve"
    onclick={onapprove}
    size="sm"
    variant="secondary"
  />
</div>
