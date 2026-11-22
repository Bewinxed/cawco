<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import {
    actionOutcomeSummary,
    actionStateMeta,
    serviceName,
  } from "./routine-format";
  import type { ApprovedAction } from "./routines-data";
  import ServiceMark from "./ServiceMark.svelte";

  let {
    action,
    showOutcome = false,
    showResponse = false,
  }: {
    action: ApprovedAction;
    showOutcome?: boolean;
    showResponse?: boolean;
  } = $props();

  let open = $state(false);
  const svc = $derived(serviceName(action.service));
  const status = $derived(actionStateMeta(action.state, action.needsLook));
</script>

<div class="flex flex-col gap-space-1">
  {#if showOutcome}
    <div
      class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta text-ink-muted"
    >
      <ServiceMark service={action.service} size="sm" />
      <span>{actionOutcomeSummary(action)}</span>
      <Button
        aria-expanded={open}
        data-box
        label={open ? "Hide the exact call" : "Show the exact call"}
        onclick={() => {
          open = !open;
        }}
        size="xs"
        variant="ghost"
      />
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-space-2">
      <Button
        aria-expanded={open}
        label={open ? "Hide the exact call" : "Show the exact call"}
        onclick={() => {
          open = !open;
        }}
        size="xs"
        variant="ghost"
      />
    </div>
  {/if}

  {#if open}
    <div
      class="flex flex-col gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3"
      transition:unfold
    >
      <div
        class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta text-ink-muted"
      >
        <ServiceMark service={action.service} size="sm" />
        <span class="font-medium text-ink-strong">{svc}</span>
        <span class="font-mono">{action.account}</span>
        <span aria-hidden="true">·</span>
        <span>{action.whenLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{status.label}</span>
      </div>

      <div
        class="flex items-start gap-space-2 rounded-sm border border-border-hairline bg-code-bg py-space-2 ps-space-3 pe-space-2"
      >
        <code
          class="min-w-0 flex-1 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere"
        >
          {action.exactCall}
        </code>
        <CopyButton
          aria-label="Copy exact call"
          class="flex-none"
          size="icon-xs"
          text={action.exactCall}
          variant="ghost"
        />
      </div>

      {#if action.task}
        <div
          class="flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
        >
          <span class="font-mono text-ink-subtle">{action.task.id}</span>
          <span class="text-ink-strong">{action.task.title}</span>
          <span aria-hidden="true">→</span>
          <span>Moves to {action.task.movesTo}</span>
        </div>
      {/if}

      {#if showResponse && action.serviceResponse}
        <p class="m-0 type-meta text-ink-muted wrap-anywhere">
          <span class="font-medium text-ink-strong">{svc} answered:</span>
          <span> {action.serviceResponse}</span>
        </p>
      {/if}
    </div>
  {/if}
</div>
