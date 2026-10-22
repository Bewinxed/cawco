<script lang="ts">
  /**
   * A mono well that never scrolls: it holds a fixed number of lines (the
   * output's last ones, a command, the hub's key), each cut at the well's
   * edge, so its height is the same whatever it is given. Copy, when it has
   * something to copy, stands inside it at the trailing edge.
   */
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";

  let {
    lines,
    rows = 1,
    copy,
    copyLabel = "Copy",
    label,
    live = false,
  }: {
    lines: readonly string[];
    /** How many lines it holds: its height. */
    rows?: number;
    /** The text Copy puts on the clipboard; no Copy without it. */
    copy?: string;
    copyLabel?: string;
    /** What the well is, for a screen reader. */
    label: string;
    /** The output's tail: its last line is said as it changes. */
    live?: boolean;
  } = $props();

  const shown = $derived.by(() => {
    const last = lines.slice(-rows);
    return [...Array.from({ length: rows - last.length }, () => ""), ...last];
  });
</script>

<div
  data-slot="well"
  data-rows={rows}
  class="flex min-w-0 items-start gap-space-2 rounded-well border border-border-well bg-surface-well py-space-1 ps-space-3 pe-space-1"
>
  <!-- What the well is, said once before its lines. -->
  <span class="sr-only">{label}:</span>
  <div
    class="flex min-w-0 flex-1 flex-col py-space-1 font-mono type-code text-ink-strong"
    aria-live={live ? "off" : undefined}
  >
    {#each shown as line, index (index)}
      <span class="block min-h-lh overflow-clip text-ellipsis whitespace-pre"
        >{line}</span
      >
    {/each}
  </div>
  {#if copy}
    <CopyButton
      aria-label={copyLabel}
      class="flex-none"
      size="xs"
      text={copy}
      variant="ghost">Copy</CopyButton
    >
  {/if}
</div>
