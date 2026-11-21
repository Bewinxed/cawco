<script lang="ts">
  import type { Snippet } from "svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconExternal,
    IconPause,
    IconPlay,
    IconSparkles,
  } from "#lib/icons.js";
  import {
    type EventRule,
    type EventSource,
    formatRelAge,
    MOCK_NOW,
    type RecentEvent,
  } from "./routines-data";
  import ServiceMark from "./ServiceMark.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    sources,
    rules,
    events,
    stale = false,
    now = MOCK_NOW,
    ontogglerule,
    onopenroutine,
    onaskcaw,
  }: {
    sources: EventSource[];
    rules: EventRule[];
    events: RecentEvent[];
    stale?: boolean;
    now?: number;
    ontogglerule: (ruleId: string) => void;
    onopenroutine: (routineId: string) => void;
    onaskcaw: (prompt: string) => void;
  } = $props();

  const webhookLive = $derived(
    sources.some((source) => source.enabled && source.delivery === "webhook")
  );
</script>

{#snippet ledgerSection(
  headingId: string,
  title: string,
  count: number,
  rows: Snippet,
  footer?: Snippet
)}
  <section aria-labelledby={headingId} class="flex flex-col gap-space-2">
    <div class="mark-line flex items-center gap-space-2">
      <h2 class="m-0 type-label text-ink-muted" id={headingId}>{title}</h2>
      <Badge data-box size="tally" variant="secondary">
        <span>{count}</span>
      </Badge>
    </div>
    <div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile">
      <ul class="m-0 list-none p-0">
        {@render rows()}
      </ul>
      {@render footer?.()}
    </div>
  </section>
{/snippet}

<div class="flex flex-col gap-space-6" data-slot="events-panel">
  <div class="flex flex-wrap items-center justify-between gap-space-3">
    <p class="m-0 type-meta text-ink-muted">
      {webhookLive
        ? "Public receiving path is live for webhooks; other services are polled on their schedule."
        : "Events arrive only when polled (no public webhook receiver configured)."}
    </p>
    <Button
      disabled={stale}
      icon={IconSparkles}
      label="Wire event with Caw"
      onclick={() =>
        onaskcaw(
          "When a GitHub issue is labelled outage on cawco/cloud, start a routine that drafts an incident brief."
        )}
      size="sm"
      variant="outline"
    />
  </div>

  {#snippet sourceRows()}
    {#each sources as source (source.id)}
      <li
        class="flex flex-col border-b border-b-border-hairline px-space-4 py-space-3 last:border-b-0"
        data-source-row={source.id}
      >
        <div class="flex flex-wrap items-center justify-between gap-space-2">
          <div class="mark-line flex min-w-0 items-center gap-space-2">
            <ServiceMark service={source.service} />
            <span class="type-label text-ink-strong">
              {source.serviceName}
            </span>
            <span class="type-meta font-mono text-ink-muted">
              {source.target}
            </span>
            <Badge
              data-box
              variant={source.delivery === "webhook" ? "live" : "secondary"}
            >
              <span>{source.cadence}</span>
            </Badge>
          </div>
          <div
            class="mark-line flex flex-none items-center gap-space-2 type-meta text-ink-muted"
          >
            {#if source.error}
              <StatusGlyph glyph="error" size="sm" tone="fail" />
              <span class="text-status-fail-ink">Failing</span>
            {:else if !source.enabled}
              <StatusGlyph glyph="pause" size="sm" tone="idle" />
              <span>Paused</span>
            {:else}
              <StatusGlyph glyph="success" size="sm" tone="done" />
              <span class="tabular-nums">
                Read {formatRelAge(source.lastReadAt, now)} ·
                {source.itemsSeen}
                {source.itemsSeen === 1 ? "item" : "items"}
              </span>
            {/if}
          </div>
        </div>
        {#if source.error}
          <RowFault
            class="mt-space-1"
            indent="var(--spacing-c-ledger-text-inset)"
            reason={source.error}
          />
        {/if}
      </li>
    {/each}
  {/snippet}
  {@render ledgerSection(
    "events-sources-h",
    "Event sources",
    sources.length,
    sourceRows
  )}

  {#snippet ruleRows()}
    {#each rules as rule (rule.id)}
      <li
        class="flex flex-wrap items-center justify-between gap-space-3 border-b border-b-border-hairline px-space-4 py-space-3 last:border-b-0"
        data-rule-row={rule.id}
      >
        <div class="flex min-w-0 flex-1 flex-col gap-space-1">
          <div class="mark-line flex flex-wrap items-center gap-space-2">
            <ServiceMark service={rule.service} size="sm" />
            <span class="type-label text-ink-strong">
              {rule.serviceName}
            </span>
            {#each rule.eventKinds as kind (kind)}
              <Badge data-box kind="meta" variant="secondary">
                <span class="font-mono">{kind}</span>
              </Badge>
            {/each}
            {#each rule.filters as filter (filter)}
              <Badge data-box kind="meta" variant="secondary">
                <span>{filter}</span>
              </Badge>
            {/each}
            {#if !rule.enabled}
              <Badge data-box variant="secondary">
                <span>Paused</span>
              </Badge>
            {/if}
          </div>
          <div
            class="mark-line flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
          >
            <span>Starts {rule.routineName}</span>
            <Button
              aria-label="Open {rule.routineName}"
              data-box
              icon={IconExternal}
              onclick={() => onopenroutine(rule.routineId)}
              size="icon-xs"
              title="Open {rule.routineName}"
              tone="quiet"
              variant="ghost"
            />
            <span aria-hidden="true">·</span>
            <span class="tabular-nums">
              {rule.lastDeliveredAt
                ? `Last delivered ${formatRelAge(rule.lastDeliveredAt, now)}`
                : "Never delivered yet"}
            </span>
          </div>
        </div>

        <Button
          disabled={stale}
          icon={rule.enabled ? IconPause : IconPlay}
          label={rule.enabled ? "Pause rule" : "Resume rule"}
          onclick={() => ontogglerule(rule.id)}
          size="xs"
          variant="ghost"
        />
      </li>
    {/each}
  {/snippet}
  {#snippet ruleFooter()}
    <div
      class="border-t border-t-border-hairline bg-surface-recess px-space-4 py-space-2 type-meta text-ink-muted"
    >
      Any event that no active rule matches goes to the project's conversation
      instead.
    </div>
  {/snippet}
  {@render ledgerSection(
    "events-rules-h",
    "Routing rules",
    rules.length,
    ruleRows,
    ruleFooter
  )}

  {#snippet eventRows()}
    {#each events as item (item.id)}
      <li
        class="flex flex-wrap items-center justify-between gap-space-2 border-b border-b-border-hairline px-space-4 py-space-3 last:border-b-0"
        data-event-row={item.id}
      >
        <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
          <ServiceMark service={item.service} size="sm" />
          <span class="min-w-0 type-body text-ink-strong wrap-anywhere">
            {item.summary}
          </span>
        </div>
        <div
          class="mark-line flex flex-none items-center gap-space-2 type-meta text-ink-muted"
        >
          {#if item.destination.kind === "routine"}
            <span>→ {item.destination.routineName}</span>
            <Button
              aria-label="Open {item.destination.routineName}"
              data-box
              icon={IconExternal}
              onclick={() => {
                if (item.destination.kind === "routine") {
                  onopenroutine(item.destination.routineId);
                }
              }}
              size="icon-xs"
              title="Open {item.destination.routineName}"
              tone="quiet"
              variant="ghost"
            />
          {:else}
            <span>→ Project conversation</span>
          {/if}
          <span aria-hidden="true">·</span>
          <span class="tabular-nums">{formatRelAge(item.at, now)}</span>
        </div>
      </li>
    {/each}
  {/snippet}
  {@render ledgerSection(
    "events-recent-h",
    "Recent events",
    events.length,
    eventRows
  )}
</div>
