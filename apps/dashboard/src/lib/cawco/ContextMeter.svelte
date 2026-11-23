<script lang="ts">
  import type { NeutralStatus } from "@cawco/core/session-messages";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconSparkles as IconCompact,
    IconLayersMinimal as IconWindow,
  } from "#lib/icons.js";
  import { loopInStep } from "#lib/platform/motion/in-step.svelte.js";
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
  import type { ContextUsage } from "./stores/sessions.svelte";

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
    status: NeutralStatus;
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

  /** The app's own ramp, by position — the SDK's `color` is not a CSS colour. */
  const SWATCH = [
    "var(--color-cyan)",
    "var(--color-blue)",
    "var(--color-orange)",
    "var(--color-tx-2)",
    "var(--color-tx)",
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
      ? "Compacting context"
      : `Context ${shown}% used. Show the breakdown.`}
    class="shrink-0"
    data-compacting={compacting || undefined}
    data-critical={band === "critical" || undefined}
    data-warn={band === "warn" || undefined}
    look="meter"
    title={meterTitle}
  >
    {#if compacting}
      <span class="breathe loops inline-flex" data-box {@attach loopInStep}
        ><IconCompact class="size-space-4" /></span
      >
      <span>Compacting</span>
    {:else}
      <!-- Glyph and number, no rail. A 28px bar under a text field is too short
           to read as a quantity and too loud to ignore; the percentage already
           is the quantity, and the shape of the window belongs in the popover
           where it has room. -->
      <IconWindow
        aria-hidden={usage ? "true" : "false"}
        aria-label={usage ? undefined : "Context usage unknown"}
        class="size-space-4 shrink-0"
        role="img"
      />
      <span
        aria-label="Context window used"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={shown}
        role="progressbar">{usage ? `${shown}%` : "—"}</span
      >
      {#if recentlyCompacted}
        <IconCompact class="size-icon-sm text-tx-2" />
      {/if}
    {/if}
  </Popover.Trigger>

  <Popover.Content align="end" frame="panel" pad="none" side="top">
    <div
      class="mark-line flex items-center gap-2 border-b border-ui-2 px-3 py-2.5"
    >
      <IconWindow class="size-icon-md text-tx-2" />
      <span class="type-label">Context window</span>
      {#if usage}
        <span
          class={[
            "ml-auto type-label tabular-nums",
            band === "critical" && "text-red",
            band === "warn" && "text-orange",
            band !== "critical" && band !== "warn" && "text-tx-2",
          ]}>{usage.percentage}%</span
        >
      {/if}
    </div>

    {#if !usage}
      <p class="px-3 py-4 type-label text-tx-2">
        No reading yet. A session has to be running to report what its window
        holds.
      </p>
    {:else}
      <div class="px-3 py-2.5">
        <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-2">
          {#each usage.categories as category, index (category.name)}
            <span
              class="h-full"
              style:width="{(category.tokens / usage.totalTokens) * 100}%"
              style:background-color={swatch(index)}
            ></span>
          {/each}
        </div>
        <p class="mt-2 type-label tabular-nums text-tx-2">
          {usage.totalTokens.toLocaleString()}
          of {usage.maxTokens.toLocaleString()} tokens used
        </p>
      </div>

      <ul class="max-h-56 overflow-y-auto border-t border-ui-2 px-3 py-2">
        {#each usage.categories as category, index (category.name)}
          <li class="flex items-center gap-2 py-space-1 type-label">
            <span
              class="size-2 shrink-0 rounded-xs"
              style:background-color={swatch(index)}
            ></span>
            <span class="min-w-0 flex-1 truncate">{category.name}</span>
            <span class="tabular-nums text-tx-2"
              >{compact(category.tokens)}</span
            >
          </li>
        {/each}
      </ul>
    {/if}

    {#if compacting}
      <p
        class="mark-line flex items-center gap-2 border-t border-ui-2 px-3 py-2 type-label"
      >
        <span class="breathe loops inline-flex" data-box {@attach loopInStep}
          ><IconCompact class="size-space-4" /></span
        >
        <span>Compacting now — the session is rewriting its own context.</span>
      </p>
    {:else if compaction}
      <p class="border-t border-ui-2 px-3 py-2 type-label text-tx-2">
        {#if compaction.result === "failed"}
          Last compaction failed{compaction.error
            ? `: ${compaction.error}`
            : "."}
        {:else}
          Compacted
          {compaction.trigger === "manual" ? "on request" : "automatically"}
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
