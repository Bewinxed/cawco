<script lang="ts">
  /**
   * Inline refusal line placed directly beside a control whose change the hub
   * or an outside service refused: announces via role="alert" with a glyph,
   * the hub's exact words, and a one-press Try again action.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconAlert, IconRefresh } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { howItRunsWords as words } from "./words";

  let {
    reason,
    onretry,
    disabled = false,
    class: className,
  }: {
    /** Exact words from the hub or outside service; nothing draws when empty. */
    reason?: string;
    onretry: () => void;
    disabled?: boolean;
    class?: string;
  } = $props();
</script>

{#if reason}
  <div
    class={cn(
      "mt-space-1 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 rounded-sm bg-status-fail-bg px-space-2 py-space-1 text-status-fail-ink",
      className
    )}
    data-slot="row-fault"
    role="alert"
  >
    <span class="mark-line flex min-w-0 flex-1 items-start gap-space-1">
      <span class="mark-cell flex-none text-status-fail-glyph" data-box>
        <IconAlert aria-hidden="true" class="size-icon-sm" />
      </span>
      <span class="min-w-0 flex-1 type-meta text-pretty wrap-anywhere"
        >{reason}</span
      >
    </span>
    <Button
      {disabled}
      icon={IconRefresh}
      label={words.tryAgain}
      onclick={onretry}
      size="xs"
      variant="ghost"
    />
  </div>
{/if}
