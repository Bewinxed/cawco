<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconClose,
    IconExternal,
    IconShieldKeyhole,
    IconTick,
  } from "#lib/icons.js";
  import { actionStateMeta, serviceName } from "./routine-format";
  import { type ApprovedAction, formatRelAge, MOCK_NOW } from "./routines-data";
  import ServiceMark from "./ServiceMark.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    actions,
    stale = false,
    now = MOCK_NOW,
    onapprove,
    ondeny,
    oncancel,
    onacknowledge,
    onopenroutine,
    onopenrun,
  }: {
    actions: ApprovedAction[];
    stale?: boolean;
    now?: number;
    onapprove: (id: string) => void;
    ondeny: (id: string) => void;
    oncancel: (id: string) => void;
    onacknowledge: (id: string) => void;
    onopenroutine: (routineId: string) => void;
    onopenrun: (routineId: string, runId: string) => void;
  } = $props();

  const waitingCount = $derived(
    actions.filter((action) => action.state === "waiting").length
  );
  const lookCount = $derived(
    actions.filter(
      (action) =>
        action.needsLook &&
        (action.state === "unknown" || action.state === "failed")
    ).length
  );

  function responseToneClass(state: ApprovedAction["state"]): string {
    if (state === "failed") {
      return "bg-status-fail-bg text-status-fail-ink";
    }
    if (state === "unknown") {
      return "bg-status-attn-bg text-status-attn-ink";
    }
    return "bg-surface-recess text-ink-muted";
  }
</script>

<div class="flex flex-col gap-space-4" data-slot="actions-panel">
  <div class="flex flex-wrap items-center justify-between gap-space-2">
    <p class="m-0 type-meta text-ink-muted">
      Outside calls proposed by routines. Each call runs once, never retried and
      never through a model.
    </p>
    {#if !stale && (waitingCount > 0 || lookCount > 0)}
      <div class="flex flex-wrap items-center gap-space-2">
        {#if waitingCount > 0}
          <Badge variant="attn">
            <span class="tabular-nums">{waitingCount} waiting on you</span>
          </Badge>
        {/if}
        {#if lookCount > 0}
          <Badge variant="fail">
            <span class="tabular-nums">{lookCount} need a look</span>
          </Badge>
        {/if}
      </div>
    {/if}
  </div>

  {#if actions.length === 0}
    <EmptyState
      icon={IconShieldKeyhole}
      line="When a routine proposes a post, comment, deploy, or merge outside CawCo, the exact call appears here."
      title="No outside actions yet"
    >
      {#snippet action()}
        <span class="type-meta text-ink-muted">Nothing waits on you.</span>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-space-3 p-0">
      {#each actions as item (item.id)}
        {@const status = actionStateMeta(item.state, item.needsLook)}
        {@const svc = serviceName(item.service)}
        <li
          class={[
            "flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile",
            item.needsLook && "ring-1 ring-status-attn-glyph",
          ]}
          data-action-card={item.id}
        >
          <!-- Header: service, account, timing, state -->
          <div class="flex flex-wrap items-center justify-between gap-space-2">
            <div
              class="mark-line flex min-w-0 flex-wrap items-center gap-space-2"
            >
              <ServiceMark service={item.service} />
              <span class="type-label text-ink-strong">{svc}</span>
              <span class="type-meta font-mono text-ink-muted"
                >{item.account}</span
              >
              <span aria-hidden="true" class="type-meta text-ink-subtle">·</span
              >
              <span class="type-meta text-ink-muted">{item.whenLabel}</span>
            </div>

            <div class="flex flex-none items-center gap-space-2">
              <span class="type-meta text-ink-subtle tabular-nums">
                {formatRelAge(item.stateAt, now)}
              </span>
              <Badge variant={status.badge}>
                <StatusGlyph
                  glyph={status.glyph}
                  size="sm"
                  tone={status.tone}
                />
                <span>{status.label}</span>
              </Badge>
            </div>
          </div>

          <!-- Proposer's sentence, explicitly attributed -->
          <div class="flex flex-col gap-space-1">
            <p class="m-0 type-body text-ink-strong wrap-anywhere">
              {item.sentence}
            </p>
            <div
              class="mark-line flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
            >
              <span>Proposed by {item.routineName}</span>
              <Button
                aria-label="Open {item.routineName}"
                data-box
                icon={IconExternal}
                onclick={() => onopenroutine(item.routineId)}
                size="icon-xs"
                title="Open {item.routineName}"
                tone="quiet"
                variant="ghost"
              />
              <span aria-hidden="true">·</span>
              <span>Run output</span>
              <Button
                aria-label="Open run that proposed this action"
                data-box
                icon={IconExternal}
                onclick={() => onopenrun(item.routineId, item.runId)}
                size="icon-xs"
                title="Open run result"
                tone="quiet"
                variant="ghost"
              />
            </div>
          </div>

          <!-- Exact call to the outside service -->
          <div
            class="flex items-start gap-space-2 rounded-well border border-border-well bg-surface-well py-space-2 ps-space-3 pe-space-2"
          >
            <code
              class="min-w-0 flex-1 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere"
            >
              {item.exactCall}
            </code>
            <CopyButton
              aria-label="Copy exact call"
              class="flex-none"
              size="icon-xs"
              text={item.exactCall}
              variant="ghost"
            />
          </div>

          <!-- Service response / unknown outcome warning -->
          {#if item.serviceResponse}
            <div
              class={[
                "rounded-sm px-space-3 py-space-2 type-meta wrap-anywhere",
                responseToneClass(item.state),
              ]}
            >
              <span class="font-medium">{svc} answered:</span>
              <span> {item.serviceResponse}</span>
            </div>
          {/if}

          <!-- Linked task and stage move -->
          {#if item.task}
            <div
              class="flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
            >
              <span class="font-mono text-ink-subtle">{item.task.id}</span>
              <span class="text-ink-strong">{item.task.title}</span>
              <span aria-hidden="true">→</span>
              <span>Moves to {item.task.movesTo} afterwards</span>
            </div>
          {/if}

          <!-- Decision / follow-up controls -->
          {#if item.state === "waiting"}
            <!-- DESIGN.md Permissions: Approve and Deny are peers at opposite ends. -->
            <div
              class="flex items-center justify-between gap-space-2 pt-space-1"
            >
              <Button
                answer="deny"
                disabled={stale}
                hit="always"
                icon={IconClose}
                label="Deny"
                onclick={() => ondeny(item.id)}
                size="sm"
                variant="secondary"
              />
              <Button
                answer="approve"
                disabled={stale}
                hit="always"
                icon={IconTick}
                label="Approve"
                onclick={() => onapprove(item.id)}
                size="sm"
                variant="secondary"
              />
            </div>
          {:else if item.state === "approved"}
            <div class="flex items-center justify-end gap-space-2 pt-space-1">
              <Button
                disabled={stale}
                label="Cancel before it runs"
                onclick={() => oncancel(item.id)}
                size="sm"
                variant="outline"
              />
            </div>
          {:else if item.needsLook && (item.state === "unknown" || item.state === "failed")}
            <div
              class="flex flex-wrap items-center justify-between gap-space-2 pt-space-1"
            >
              <span class="type-meta text-status-attn-ink">
                Stays marked until you confirm you checked {svc}.
              </span>
              <Button
                disabled={stale}
                icon={IconTick}
                label="I've looked at {svc}"
                onclick={() => onacknowledge(item.id)}
                size="sm"
                variant="outline"
              />
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
