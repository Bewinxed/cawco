<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { ARRIVE } from "./motion.js";

  /**
   * A surface that opens beside what it came from: on a desk a column of
   * its own beside the thread, which stays live; narrower, a sheet from the
   * foot over a scrim. One bar, one row: its short title and Close, the
   * symbol alone. Its form follows the Exchange's width (its container).
   */
  let {
    title,
    closeLabel,
    onclose,
    children,
  }: {
    title: string;
    closeLabel: string;
    onclose?: () => void;
    children: Snippet;
  } = $props();
</script>

<div
  aria-hidden="true"
  class={cn(
    "absolute inset-0 z-(--layer-sheet) bg-scrim @wide/exchange:hidden",
    ARRIVE
  )}
></div>
<section
  class={cn(
    ARRIVE,
    "absolute inset-x-0 bottom-0 z-(--layer-sheet) flex max-h-full min-w-0 flex-col gap-space-4 overflow-y-auto rounded-t-modal bg-surface-raised px-space-5 pt-space-3 pb-space-6 shadow-drawer @wide/exchange:static @wide/exchange:z-auto @wide/exchange:max-h-none @wide/exchange:w-105 @wide/exchange:flex-none @wide/exchange:overflow-y-auto @wide/exchange:rounded-none @wide/exchange:border-border-hairline @wide/exchange:border-s @wide/exchange:bg-transparent @wide/exchange:px-space-5 @wide/exchange:py-space-4 @wide/exchange:shadow-none"
  )}
  aria-label={title}
>
  <div class="flex min-h-c-btn-h items-center gap-space-2">
    <h2 class="type-label min-w-0 flex-1 truncate text-ink-strong">{title}</h2>
    <Button
      aria-label={closeLabel}
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title={closeLabel}
      variant="ghost"
    />
  </div>
  {@render children()}
</section>
