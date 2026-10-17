<script lang="ts">
  /**
   * A workflow run's tab: what a session's tab is for a session, drawn on the
   * transcript's columns (app.css `.tx-columns`). Its tab names it and says
   * where it stands, so the page opens on what the tab cannot say — when it
   * started, what it was given, and what can be done with it — and then the
   * run as its chat block draws it (RunBlock): its line, and its steps hung
   * under it on the nesting lines, each opening its transcript and its
   * result, and its own session's tab. Then the question it waits on, and its
   * log. There is no graph here: a graph is for editing (/workflows/[id]).
   */
  import type { WorkflowStep } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import {
    Asker,
    type AskHereRequest,
    type AskItem,
  } from "#lib/cawco/ask-here.svelte.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    cawOf,
    sessionStatus,
    statusWord,
  } from "#lib/cawco/session-status.js";
  import RunBlock from "#lib/cawco/transcript/RunBlock.svelte";
  import { runHref } from "#lib/cawco/workflow-runs.js";
  import {
    refreshWorkflowLog,
    refreshWorkflowRun,
    workflowState,
  } from "#lib/cawco/workflow-state.svelte.js";
  import {
    answerWorkflow,
    cancelWorkflowRun,
    rerunWorkflow,
  } from "#lib/cawco/workflows.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import { goto } from "$app/navigation";
  import { journalCheckpoints, journalLog } from "./journal-graph";

  let { runId }: { runId: string } = $props();

  let errorMessage = $state("");
  /** The action whose request is out ("rerun", "rerun-step", "answer:<label>", "cancel"). */
  let acting = $state<string | null>(null);
  const busy = $derived(acting !== null);
  let other = $state("");
  let note = $state("");
  /** A typed answer, as JSON, for a question that declared an answer schema. */
  let valueText = $state("");
  let logOpen = $state(false);

  const run = $derived(workflowState.details[runId]);
  const workflow = $derived(
    workflowState.workflows.find((entry) => entry.id === run?.workflowId)
  );
  const effects = $derived(workflowState.logs[runId] ?? []);
  /** The program's log lines and its checkpoints, in the order they happened. */
  const logLines = $derived(
    [
      ...journalLog(effects).map((line) => ({
        seq: line.seq,
        at: line.at,
        text: line.text,
      })),
      ...journalCheckpoints(effects).map((mark) => ({
        seq: mark.seq,
        at: mark.at,
        text: `Checkpoint · ${mark.label}`,
      })),
    ].sort((a, b) => a.seq - b.seq)
  );
  const going = $derived(
    run?.status === "running" || run?.status === "waiting"
  );
  const live = $derived(cawco.hub === "connected");
  const inputs = $derived(Object.entries(run?.inputs ?? {}));
  /** When it started, to the minute, with the day when it was not today. */
  const startedAt = $derived.by(() => {
    if (!run) {
      return "";
    }
    const at = new Date(run.startedAt);
    const today = at.toDateString() === new Date().toDateString();
    return at.toLocaleString(
      undefined,
      today
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    );
  });

  $effect(() => {
    const id = runId;
    refreshWorkflowRun(id).catch((caught) => {
      errorMessage = message(caught);
    });
  });
  // The log is re-read whenever the run moves: a checkpoint, a log line or a
  // new call arrives as a frame without a step row of its own.
  $effect(() => {
    const moved = run;
    if (moved) {
      refreshWorkflowLog(runId).catch((caught) => {
        errorMessage = message(caught);
      });
    }
  });

  /**
   * What the last action came to when the hub refused it: said under the
   * button that was pressed (`key`), where the person is looking, with the
   * button itself the way to try again.
   */
  let fault = $state<{ key: string; reason: string } | null>(null);
  const faultOf = (key: string) => (fault?.key === key ? fault.reason : null);

  async function act(key: string, action: () => Promise<unknown>) {
    acting = key;
    fault = null;
    try {
      await action();
      await refreshWorkflowRun(runId);
    } catch (caught) {
      fault = { key, reason: message(caught) };
    } finally {
      acting = null;
    }
  }
  /**
   * Cancel asks under the run's head, in the page (The Open Page Rule:
   * nothing elsewhere breaks while it stands). What it reaches is named and
   * read live: the steps running now, each as the rail names a session, with
   * what it is doing; a step that ends while the question stands leaves it.
   */
  const asks = new Asker<AskHereRequest>();
  const liveSteps = (): AskItem[] =>
    (run?.steps ?? [])
      .filter((entry) => entry.status === "running" && entry.instanceId)
      .map((entry) => {
        const id = entry.instanceId as string;
        const row = cawco.instanceIndex.byId.get(id);
        const status = sessionStatus(row);
        return {
          id,
          title: row?.title || entry.nodeId,
          lead: {
            kind: "session" as const,
            place: row?.cwd || row?.machineId || id,
            status,
            caw: cawOf(id),
          },
          status: statusWord(row, status),
        };
      });
  // A run that ended while asked has nothing left to cancel.
  $effect(() => {
    if (!going) {
      asks.dismiss();
    }
  });
  async function cancel() {
    await asks.ask({
      at: "cancel-run",
      title: "Cancel this run?",
      body: "The steps running now stop, with any child runs, and pending steps are skipped.",
      confirmLabel: "Cancel run",
      cancelLabel: "Keep running",
      destructive: true,
      items: liveSteps,
      pendingLabel: "Cancelling…",
      // Not through `act`: a refusal is the question's to show, under it.
      run: async () => {
        acting = "cancel";
        try {
          await cancelWorkflowRun(runId);
          await refreshWorkflowRun(runId);
        } finally {
          acting = null;
        }
      },
    });
  }
  /** Runs the workflow again, from the start or from one step, and opens the new run's tab. */
  async function rerun(fromStepId?: string) {
    await act(fromStepId ? `rerun-step:${fromStepId}` : "rerun", async () => {
      const result = await rerunWorkflow(runId, fromStepId);
      await goto(runHref(result.runId));
    });
  }
  /** The typed answer's JSON, parsed; undefined when the field is empty. */
  function typedValue(): unknown {
    return valueText.trim() ? JSON.parse(valueText) : undefined;
  }
  /** An input's value in a line: text as itself, anything else as JSON. */
  const shown = (value: unknown): string =>
    typeof value === "string" ? value : JSON.stringify(value);
  const offline = (doing: string): string | undefined =>
    live ? undefined : `Can't ${doing} while the hub is unreachable`;
</script>

{#snippet rerunFrom(step: WorkflowStep)}
  <!-- Everything this run did before the step is kept: the new run is
       handed those results and goes live from here. -->
  {@const key = `rerun-step:${step.id}`}
  <Button
    disabled={(busy && acting !== key) || !live || going}
    failed={faultOf(key) !== null}
    label="Re-run from this step"
    onclick={() => rerun(step.id)}
    pending={acting === key}
    pendingLabel="Re-running…"
    size="sm"
    title={offline("re-run") ??
      "Run the workflow again from this step, keeping what came before it"}
    variant="outline"
  />
  <RowFault reason={faultOf(key)} />
{/snippet}

<!-- literal: 26px, 14rem -->
<div
  data-slot="tx-columns"
  data-run-view
  class="tx-columns flex min-h-0 min-w-0 flex-auto flex-col gap-space-5 overflow-y-auto bg-surface-recess pt-space-6 pr-space-6 pb-space-7 pl-space-7 text-size-body font-normal text-ink-strong max-desk:px-space-5"
  style:--rail-none="0px"
>
  {#if errorMessage}
    <Alert role="alert" variant="destructive">
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  {/if}
  <!-- The name waits for the workflow list, so it never paints as
       "Workflow" and then widens into the real one. -->
  {#if !(run && (workflow || workflowState.loaded))}
    <div
      aria-label="Loading workflow run"
      class="flex flex-col gap-space-3"
      role="status"
      style:--skeleton-h="26px"
      style:--skeleton-w="14rem"
    >
      <Skeleton class="h-icon-md w-(--skeleton-w)" />
      <Skeleton class="h-(--skeleton-h) w-full" />
      <Skeleton class="h-(--skeleton-h) w-full" />
    </div>
  {:else}
    <!-- What the tab cannot say, before the run: it stands at the page's
         edge as a transcript's prose does, clear of the run's lines. -->
    <header
      data-slot="head"
      class="flex flex-wrap items-start justify-between gap-x-space-5 gap-y-space-3"
    >
      <div
        class="flex min-w-0 flex-col gap-space-1 text-size-meta leading-meta"
      >
        <p class="m-0 text-ink-muted">Started {startedAt}</p>
        <!-- A command of the run held by its machine's pause, or queued for
             a shared slot: said where the run's facts are, until it goes. -->
        {#if going && run.waiting}
          <p class="m-0 text-ink-strong" role="status">
            {run.waiting.charAt(0).toUpperCase()}{run.waiting.slice(1)}
          </p>
        {/if}
        {#if inputs.length}
          <!-- literal: 72ch -->
          <dl
            class="m-0 grid grid-cols-(--pair-cols) gap-x-space-3 gap-y-space-1"
            style:--measure="72ch"
            style:--pair-cols="auto minmax(0, 1fr)"
          >
            {#each inputs as [key, value] (key)}
              <div class="contents">
                <dt class="text-ink-muted">{key}</dt>
                <dd
                  data-workflow-run-view-code={typeof value !== "string" ||
                    undefined}
                  class="m-0 max-w-(--measure) wrap-anywhere text-ink-strong data-is-code:font-(family-name:--font-mono) data-is-code:liga-none"
                  data-is-code={typeof value !== "string" || undefined}
                >
                  {shown(value)}
                </dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>
      <div data-slot="actions" class="flex flex-wrap gap-space-2">
        {#if going}
          <Button
            aria-expanded={asks.pending !== null}
            disabled={busy || !live}
            label="Cancel run"
            onclick={cancel}
            size="sm"
            title={offline("cancel")}
            variant="outline"
          />
        {:else}
          <Button
            disabled={(busy && acting !== "rerun") || !live}
            failed={faultOf("rerun") !== null}
            label="Re-run"
            onclick={() => rerun()}
            pending={acting === "rerun"}
            pendingLabel="Re-running…"
            size="sm"
            title={offline("re-run") ??
              "Start this workflow again with the same inputs"}
            variant="outline"
          />
        {/if}
        <Button
          href="/workflows/{run.workflowId}?tab=program"
          size="sm"
          variant="outline">Edit workflow</Button
        >
        <RowFault class="basis-full" reason={faultOf("rerun")} />
      </div>
    </header>
    <AskHere asker={asks} at="cancel-run" />

    <RunBlock here more={rerunFrom} {runId} />

    {#if run.status === "waiting" && run.ask}
      {@const ask = run.ask}
      <!-- The question folds open; answered, the picked option pends until
           the hub moves the run on, and then the block folds away. -->
      <!-- literal: 72ch -->
      <div
        class="max-w-(--measure)"
        style:--measure="72ch"
        in:unfold
        out:unfold
      >
        <Card.Root size="sm">
          <Card.Header>
            <Card.Title>{ask.question}</Card.Title>
          </Card.Header>
          <Card.Content class="flex flex-col" gap="section">
            {#if ask.options.length}
              <!-- Peers the workflow's author wrote, none of them the
                   recommended action: each an outline button, its
                   description beside it. -->
              <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
                {#each ask.options as option (option.label)}
                  {@const key = `answer:${option.label}`}
                  <li class="flex min-w-0 items-baseline gap-space-3">
                    <Button
                      disabled={(busy && acting !== key) || !live}
                      failed={faultOf(key) !== null}
                      label={option.label}
                      onclick={() =>
                        act(key, () =>
                          answerWorkflow(runId, ask.stepId, {
                            choice: option.label,
                            note,
                            value: typedValue(),
                          })
                        )}
                      pending={acting === key}
                      pendingLabel="Answering…"
                      size="sm"
                      title={offline("answer")}
                      variant="outline"
                    />
                    {#if option.description}
                      <p
                        class="m-0 text-size-meta leading-meta wrap-anywhere text-ink-muted"
                      >
                        {option.description}
                      </p>
                    {/if}
                    <RowFault reason={faultOf(key)} />
                  </li>
                {/each}
              </ul>
            {/if}
            <div
              data-slot="workflow-run-view-field"
              class="flex flex-col gap-space-2"
            >
              <Label for="run-note-{runId}">Note (optional)</Label>
              <Input id="run-note-{runId}" bind:value={note} />
            </div>
            {#if ask.answerSchema}
              <!-- A typed answer: its JSON is checked by the hub against the
                   schema the program declared, shown here as the placeholder. -->
              <div
                data-slot="workflow-run-view-field"
                class="flex flex-col gap-space-2"
              >
                <Label for="run-value-{runId}">Answer value (JSON)</Label>
                <Textarea
                  id="run-value-{runId}"
                  placeholder={JSON.stringify(ask.answerSchema)}
                  rows={3}
                  bind:value={valueText}
                />
              </div>
              {#if !ask.options.length}
                <div data-slot="send" class="flex">
                  <Button
                    disabled={!valueText.trim() ||
                      (busy && acting !== "value") ||
                      !live}
                    failed={faultOf("value") !== null}
                    label="Send answer"
                    onclick={() =>
                      act("value", () =>
                        answerWorkflow(runId, ask.stepId, {
                          note,
                          value: typedValue(),
                        })
                      )}
                    pending={acting === "value"}
                    pendingLabel="Sending…"
                    size="sm"
                    title={offline("answer")}
                  />
                </div>
                <RowFault reason={faultOf("value")} />
              {/if}
            {/if}
            {#if ask.allowOther}
              <div
                data-slot="workflow-run-view-field"
                class="flex flex-col gap-space-2"
              >
                <Label for="run-other-{runId}">Other answer</Label>
                <div data-slot="other" class="flex items-center gap-space-2">
                  <Input id="run-other-{runId}" bind:value={other} />
                  <Button
                    disabled={!other || (busy && acting !== "answer") || !live}
                    failed={faultOf("answer") !== null}
                    label="Send answer"
                    onclick={() =>
                      act("answer", () =>
                        answerWorkflow(runId, ask.stepId, {
                          choice: other,
                          note,
                          value: typedValue(),
                        })
                      )}
                    pending={acting === "answer"}
                    pendingLabel="Sending…"
                    size="sm"
                    title={offline("answer")}
                    variant="outline"
                  />
                </div>
                <RowFault reason={faultOf("answer")} />
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    {/if}

    {#if logLines.length}
      <!-- literal: 30dvh -->
      <details
        data-slot="log"
        bind:open={logOpen}
        style:--log-h="30dvh"
        style:--pair-cols="auto minmax(0, 1fr)"
        in:unfold
        out:unfold
      >
        <summary
          class="cursor-pointer py-space-2 text-size-label font-medium text-ink-muted coarse:py-space-4"
          >Log · <span data-slot="num" class="num">{logLines.length}</span
          ></summary
        >
        <!-- A line arrives the house way (motion/rows), and the log keeps
             the newest in view only while the reader is at its end. -->
        <ol
          class="m-0 grid h-(--log-h) list-none content-start gap-space-2 overflow-y-auto px-0 pt-space-2 pb-0"
          {@attach reflow()}
          {@attach followTail()}
        >
          {#each logLines as line (line.seq)}
            <li
              class="grid grid-cols-(--pair-cols) gap-space-3 wrap-anywhere"
              data-flip
            >
              <time data-slot="num" class="num text-size-meta text-ink-muted"
                >{new Date(line.at).toLocaleTimeString()}</time
              ><span>{line.text}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  {/if}
</div>

<style>
  /* residual: foreign-dom — the run's block is RunBlock's own root; it draws
     its own rail-row gap, and the column's gap stands for it. */
  [data-run-view] > :global([data-run-block]) {
    --rail-gap: var(--rail-none);
  }
</style>
