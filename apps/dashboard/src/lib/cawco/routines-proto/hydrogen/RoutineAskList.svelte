<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconKeep,
    IconPlay,
    IconRefresh,
    IconSparkles,
    IconTick,
  } from "#lib/icons.js";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import InlineConfirm from "./InlineConfirm.svelte";
  import PeerAnswerRow from "./PeerAnswerRow.svelte";
  import {
    formatHeldSummary,
    type RoutineAsk,
    serviceName,
  } from "./routine-format";
  import type { Routine } from "./routines-data";

  let {
    asks,
    routine,
    stale = false,
    variant = "row",
    onfixwithcaw,
    onrunnow,
    onkeep,
    onapprove,
    ondeny,
    onacknowledge,
    onresumerule,
    onextenddate,
    onmarkdone,
  }: {
    asks: RoutineAsk[];
    routine: Routine;
    stale?: boolean;
    variant?: "row" | "pane";
    onfixwithcaw: (prompt: string) => void;
    onrunnow: (routineId: string) => void;
    onkeep: (routineId: string) => void;
    onapprove: (actionId: string) => void;
    ondeny: (actionId: string) => void;
    onacknowledge: (actionId: string) => void;
    onresumerule: (ruleId: string) => void;
    onextenddate?: (routineId: string, days: number | null) => void;
    onmarkdone?: (routineId: string) => void;
  } = $props();

  let confirmingDoneId = $state<string | null>(null);
  const doneWhen = $derived(routine.doneWhen ?? null);
</script>

<ul
  class="m-0 flex list-none flex-col gap-space-2 p-0"
  data-slot="routine-asks"
>
  {#each asks as ask (ask.id)}
    <li
      class={[
        "flex flex-col gap-space-2",
        variant === "pane" &&
          "rounded-well border border-border-hairline bg-surface-raised p-space-3",
      ]}
      data-ask={ask.kind}
    >
      {#if ask.kind === "action-waiting"}
        <p class="m-0 type-meta text-ink-strong wrap-anywhere">
          {ask.sentence}
        </p>
        <ExactCallDisclosure action={ask.action} />
        <PeerAnswerRow
          disabled={stale}
          onapprove={() => onapprove(ask.action.id)}
          ondeny={() => ondeny(ask.action.id)}
        />
      {:else if ask.kind === "action-check"}
        <div
          class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
        >
          <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong wrap-anywhere">
            {ask.sentence}
          </p>
          <Button
            disabled={stale}
            icon={IconTick}
            label="I've checked"
            onclick={() => onacknowledge(ask.action.id)}
            size="xs"
            variant="outline"
          />
        </div>
        {#if variant === "pane" && ask.action.serviceResponse}
          <p class="m-0 type-meta text-ink-muted wrap-anywhere">
            <span class="font-medium text-ink-strong">
              {serviceName(ask.action.service)} answered:
            </span>
            <span> {ask.action.serviceResponse}</span>
          </p>
        {/if}
        <ExactCallDisclosure
          action={ask.action}
          showResponse={variant === "row"}
        />
      {:else if ask.kind === "stopped"}
        <div
          class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
        >
          <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong wrap-anywhere">
            {ask.sentence}
          </p>
          <div class="flex flex-none flex-wrap items-center gap-space-2">
            {#if ask.timedOut && onextenddate}
              <Button
                disabled={stale}
                icon={IconRefresh}
                label="Extend 7 days"
                onclick={() => onextenddate(ask.routineId, 7)}
                size="xs"
                variant="outline"
              />
              {#if onmarkdone}
                <Button
                  disabled={stale}
                  icon={IconTick}
                  label="Mark done"
                  onclick={() => {
                    confirmingDoneId =
                      confirmingDoneId === ask.id ? null : ask.id;
                  }}
                  size="xs"
                  variant="outline"
                />
              {/if}
            {:else}
              <Button
                disabled={stale}
                icon={IconSparkles}
                label="Fix with Caw"
                onclick={() => onfixwithcaw(ask.fixPrompt)}
                size="xs"
                variant="outline"
              />
            {/if}
          </div>
        </div>

        {#if confirmingDoneId === ask.id && onmarkdone && doneWhen}
          <InlineConfirm
            confirmIcon={IconTick}
            confirmLabel="Mark done & release work"
            confirmVariant="grant"
            oncancel={() => {
              confirmingDoneId = null;
            }}
            onconfirm={() => {
              confirmingDoneId = null;
              onmarkdone(ask.routineId);
            }}
            title="Mark this done yourself?"
          >
            <p class="m-0 text-ink-muted">
              Checking stops for good and records that you marked it done.
              {#if doneWhen.heldTasks.length > 0 || doneWhen.heldSteps > 0}
                Waiting work goes ahead immediately ({formatHeldSummary(
                  doneWhen.heldTasks,
                  doneWhen.heldSteps
                )}).
              {/if}
            </p>
          </InlineConfirm>
        {/if}
      {:else if ask.kind === "run-failed"}
        <div
          class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
        >
          <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong wrap-anywhere">
            {ask.sentence}
          </p>
          <div class="flex flex-none items-center gap-space-2">
            {#if variant === "pane"}
              <Button
                disabled={stale}
                icon={IconSparkles}
                label="Fix with Caw"
                onclick={() => onfixwithcaw(ask.fixPrompt)}
                size="xs"
                variant="ghost"
              />
            {/if}
            <Button
              disabled={stale || routine.status === "running"}
              icon={IconPlay}
              label="Run again"
              onclick={() => onrunnow(ask.routineId)}
              size="xs"
              variant="outline"
            />
          </div>
        </div>
      {:else if ask.kind === "agent-unkept"}
        <div
          class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
        >
          <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong wrap-anywhere">
            {ask.sentence}
          </p>
          <Button
            disabled={stale}
            icon={IconKeep}
            label="Keep"
            onclick={() => onkeep(ask.routineId)}
            size="xs"
            variant="outline"
          />
        </div>
        {#if variant === "pane" && ask.why}
          <blockquote
            class="m-0 rounded-sm border border-border-well bg-surface-well px-space-3 py-space-2 type-meta text-ink-strong"
          >
            <span class="text-ink-muted">Session said: </span>
            "{ask.why}"
          </blockquote>
        {/if}
      {:else if ask.kind === "trigger-fault"}
        <div
          class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
        >
          <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong wrap-anywhere">
            {ask.sentence}
          </p>
          {#if ask.canResumeRule}
            <Button
              disabled={stale}
              icon={IconPlay}
              label="Resume rule"
              onclick={() => onresumerule(ask.ruleId)}
              size="xs"
              variant="outline"
            />
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>
