<script lang="ts">
  /**
   * Who decides standing anchor on the Waiting strip: a first-rank fact
   * stating Fleet rules or N project rules (plus Review on), a skeleton pill
   * while reading, or crimson Rules unreadable on a failed read. Pressing it
   * switches directly to the Decisions view where the rule header stands.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronRight,
    IconRules,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { hubReading } from "./format";
  import type { GovernedRecord, ProjectView } from "./records";
  import { words } from "./words";

  let {
    record,
    now: _now,
    active = false,
    onview,
  }: {
    record: GovernedRecord;
    now: number;
    active?: boolean;
    onview: (view: ProjectView) => void;
  } = $props();

  const { asOfTime, staleMeta } = $derived(hubReading(record));

  const ownCount = $derived(
    record.decides.state === "read"
      ? Object.values(record.decides.value).filter((route) => route.own).length
      : 0
  );

  const standingText = $derived.by(() => {
    if (record.decides.state === "failed") {
      return words.waiting.rulesUnreadable;
    }
    const base =
      ownCount === 0
        ? words.waiting.fleetRules
        : words.waiting.projectRules(ownCount);
    return record.project.review ? `${base} · ${words.waiting.reviewOn}` : base;
  });

  const tipLabel = $derived.by(() => {
    if (asOfTime) {
      return words.hub.outOfReachTip(asOfTime);
    }
    return record.decides.state === "failed"
      ? record.decides.reason
      : words.waiting.whoDecidesTip;
  });
</script>

{#if record.decides.state === "reading"}
  <span
    aria-label={words.waiting.readingAria}
    class="inline-flex items-center"
    role="status"
  >
    <Skeleton height="control-sm" radius="chip" width="title" />
  </span>
{:else}
  <Tip label={tipLabel}>
    {#snippet children(tipProps)}
      <button
        {...tipProps}
        aria-current={active ? "page" : undefined}
        aria-label={words.waiting.whoDecidesAria(standingText, staleMeta)}
        class={cn(
          chipVariants({
            variant: "setting",
            tone: record.decides.state === "failed" ? "fail" : undefined,
          }),
          active &&
            record.decides.state !== "failed" &&
            "border-brand-solid bg-surface-recess"
        )}
        onclick={() => onview("decisions")}
        type="button"
      >
        {#if record.decides.state === "failed"}
          <IconWarningTriangle
            aria-hidden="true"
            class="text-status-fail-glyph"
          />
        {:else}
          <IconRules aria-hidden="true" class="text-ink-strong" />
        {/if}
        <span data-slot="chip-label">
          <MorphText text={standingText} />
        </span>
        {#if asOfTime}
          <span class="type-meta text-ink-subtle num">· {asOfTime}</span>
        {/if}
        <IconChevronRight aria-hidden="true" data-slot="chevron" />
      </button>
    {/snippet}
  </Tip>
{/if}
