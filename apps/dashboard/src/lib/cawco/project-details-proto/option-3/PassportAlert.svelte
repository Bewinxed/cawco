<script lang="ts">
  /**
   * Inline fault block shared by standing policy and task mirror reads:
   * crimson warning glyph in the lead column, fault title, verbatim reason,
   * and a Try again control.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { passportWords as words } from "./words";

  let {
    title,
    detail,
    onretry,
    disabled = false,
    narrow = false,
  }: {
    title: string;
    detail: string;
    onretry: () => void;
    disabled?: boolean;
    narrow?: boolean;
  } = $props();
</script>

<!-- mark-line: glyph aligns to first line of stacked failure copy -->
<div class="grid grid-cols-mark-fluid items-start gap-x-space-2" role="alert">
  <span class="mark-cell" data-box>
    <IconWarningTriangle
      aria-hidden="true"
      class="size-icon-sm text-status-fail-glyph"
    />
  </span>
  <div class="flex min-w-0 flex-col gap-space-1">
    <p class="m-0 type-label text-status-fail-ink">{title}</p>
    <p class="m-0 type-meta break-word text-ink-muted">{detail}</p>
    <div class="pt-space-row">
      <Button
        {disabled}
        hit={narrow ? "always" : undefined}
        onclick={onretry}
        size="xs"
        variant="outline"
      >
        {words.common.tryAgain}
      </Button>
    </div>
  </div>
</div>
