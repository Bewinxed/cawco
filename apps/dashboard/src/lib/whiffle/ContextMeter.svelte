<script lang="ts">
  import type { SDKStatus } from "@whiffle/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import IconWindow from "~icons/solar/layers-minimalistic-bold-duotone";
  import IconCompact from "~icons/solar/magic-stick-3-bold-duotone";
  /**
   * How full the session's context window is, on the dock where the user is
   * already looking. Quiet until it matters: a thin bar and a percentage at
   * rest, the fill taking a warning colour as the window fills, and the whole
   * pill saying "Compacting" for as long as the session says it is doing that.
   *
   * The numbers are the SDK's own (`getContextUsage`, what `/context` reads),
   * never an estimate summed from frames that went past. The colours are not:
   * the SDK reports its own theme keys ("inactive", "promptBorder"), which are
   * neither CSS nor distinct — three categories share one — so the swatches
   * come from this app's chart ramp instead.
   */
  import type { ContextUsage } from "./client.svelte";

  interface Props {
    compaction: {
      at: number;
      preTokens: number;
      trigger: "manual" | "auto";
      result?: "success" | "failed";
      error?: string;
    } | null;
    /** Asks the session for a fresh reading — on open, so the panel is never stale. */
    onrefresh?: () => void;
    status: SDKStatus;
    usage: ContextUsage | null;
  }

  let { usage, status, compaction, onrefresh }: Props = $props();

  const compacting = $derived(status === "compacting");

  /**
   * Three bands, because the number alone does not say what to do about it.
   * Below 70% there is nothing to think about, so the meter stays neutral.
   */
  const band = $derived.by(() => {
    const pct = usage?.percentage ?? 0;
    if (pct >= 90) {
      return "critical";
    }
    if (pct >= 70) {
      return "warn";
    }
    return "calm";
  });

  const _FILL: Record<string, string> = {
    calm: "bg-muted-foreground/60",
    warn: "bg-warning",
    critical: "bg-destructive",
  };

  const TEXT: Record<string, string> = {
    calm: "text-muted-foreground",
    warn: "text-warning",
    critical: "text-destructive",
  };

  /** The app's own ramp, by position — the SDK's `color` is not a CSS colour. */
  const SWATCH = [
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-1)",
  ];
  const swatch = (index: number): string => SWATCH[index % SWATCH.length];

  const compact = (tokens: number): string =>
    tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);

  /** A compaction is worth showing for a while, then it is just history. */
  const RECENT_MS = 60_000;
  const recentlyCompacted = $derived(
    !compacting && compaction !== null && Date.now() - compaction.at < RECENT_MS
  );

  const shown = $derived(usage?.percentage ?? 0);

  const meterTitle = $derived.by(() => {
    if (compacting) {
      return "Compacting the context window";
    }
    if (usage) {
      return `Context: ${usage.totalTokens.toLocaleString()} of ${usage.maxTokens.toLocaleString()} tokens`;
    }
    return "Context usage";
  });
</script>

<Popover.Root
  onOpenChange={(open) => {
    if (open) {
      onrefresh?.();
    }
  }}
>
  <Popover.Trigger
    aria-label={compacting
      ? 'Compacting context'
      : `Context ${shown}% used. Show the breakdown.`}
    class="flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5
           text-label tabular-nums
           hover:bg-muted
           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
           transition-[background-color,color] duration-150 ease-out
           {compacting ? 'text-foreground' : TEXT[band]}"
    title={meterTitle}
  >
    {#if compacting}
      <IconCompact class="size-3.5 animate-pulse" />
      <span>Compacting</span>
    {:else}
      <!-- Glyph and number, no rail. A 28px bar under a text field is too short
           to read as a quantity and too loud to ignore; the percentage already
           is the quantity, and the shape of the window belongs in the popover
           where it has room. -->
      <IconWindow
        aria-hidden={usage ? 'true' : 'false'}
        aria-label={usage ? undefined : 'Context usage unknown'}
        class="size-3.5 shrink-0"
        role="img"
      />
      <span
        aria-label="Context window used"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={shown}
        role="progressbar"
        >{usage ? `${shown}%` : '—'}</span
      >
      {#if recentlyCompacted}
        <IconCompact class="size-3 text-muted-foreground" />
      {/if}
    {/if}
  </Popover.Trigger>

  <Popover.Content
    align="end"
    class="w-72 rounded-[var(--radius-lg)] shadow-lg p-0"
    side="top"
  >
    <div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <IconWindow class="size-4 text-muted-foreground" />
      <span class="text-label font-medium">Context window</span>
      {#if usage}
        <span class="ml-auto text-label tabular-nums {TEXT[band]}"
          >{usage.percentage}%</span
        >
      {/if}
    </div>

    {#if !usage}
      <p class="px-3 py-4 text-label text-muted-foreground">
        No reading yet. A session has to be running to report what its window
        holds.
      </p>
    {:else}
      <div class="px-3 py-2.5">
        <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {#each usage.categories as category, index (category.name)}
            <span
              class="h-full"
              style="width: {(category.tokens / usage.totalTokens) * 100}%; background-color: {swatch(index)}"
            ></span>
          {/each}
        </div>
        <p class="mt-2 text-label tabular-nums text-muted-foreground">
          {usage.totalTokens.toLocaleString()}
          of {usage.maxTokens.toLocaleString()} tokens used
        </p>
      </div>

      <ul class="max-h-56 overflow-y-auto border-t border-border px-3 py-2">
        {#each usage.categories as category, index (category.name)}
          <li class="flex items-center gap-2 py-1 text-label">
            <span
              class="size-2 shrink-0 rounded-[2px]"
              style="background-color: {swatch(index)}"
            ></span>
            <span class="min-w-0 flex-1 truncate">{category.name}</span>
            <span class="tabular-nums text-muted-foreground"
              >{compact(category.tokens)}</span
            >
          </li>
        {/each}
      </ul>
    {/if}

    {#if compacting}
      <p
        class="flex items-center gap-2 border-t border-border px-3 py-2 text-label"
      >
        <IconCompact class="size-3.5 animate-pulse" />
        Compacting now — the session is rewriting its own context.
      </p>
    {:else if compaction}
      <p
        class="border-t border-border px-3 py-2 text-label text-muted-foreground"
      >
        {#if compaction.result === 'failed'}
          Last compaction failed{compaction.error ? `: ${compaction.error}` : '.'}
        {:else}
          Compacted
          {compaction.trigger === 'manual' ? 'on request' : 'automatically'}
          from
          <span class="tabular-nums"
            >{compaction.preTokens.toLocaleString()}</span
          >
          tokens.
        {/if}
      </p>
    {/if}
  </Popover.Content>
</Popover.Root>
