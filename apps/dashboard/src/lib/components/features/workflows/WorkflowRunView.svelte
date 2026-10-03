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
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import { message } from "#lib/cawco/delegate-types.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
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

  async function act(key: string, action: () => Promise<unknown>) {
    acting = key;
    errorMessage = "";
    try {
      await action();
      await refreshWorkflowRun(runId);
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      acting = null;
    }
  }
  async function cancel() {
    const names = (run?.steps ?? [])
      .filter((entry) => entry.status === "running" && entry.instanceId)
      .map(
        (entry) =>
          cawco.instanceIndex.byId.get(entry.instanceId as string)?.title ??
          entry.nodeId
      );
    await confirm({
      title: "Cancel workflow run?",
      body: `Stops these live sessions and any child runs: ${names.length ? names.join(", ") : "No live step sessions reported"}. Pending steps will be skipped.`,
      confirmLabel: "Cancel run",
      destructive: true,
      pendingLabel: "Cancelling…",
      // Not through `act`: a failure is the dialog's to show, under its body.
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
    await act(fromStepId ? "rerun-step" : "rerun", async () => {
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

{#snippet rerunFrom(
  step: WorkflowStep
)}
  <!-- Everything this run did before the step is kept: the new run is
       handed those results and goes live from here. -->
  <Button
    disabled={(busy && acting !== "rerun-step") || !live || going}
    failed={errorMessage !== ""}
    label="Re-run from this step"
    onclick={() => rerun(step.id)}
    pending={acting === "rerun-step"}
    pendingLabel="Re-running…"
    size="sm"
    title={offline("re-run") ??
      "Run the workflow again from this step, keeping what came before it"}
    variant="outline"
  />
{/snippet}

<div class="run-view tx-columns">
  {#if errorMessage}
    <Alert role="alert" variant="destructive">
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  {/if}
  <!-- The name waits for the workflow list, so it never paints as
       "Workflow" and then widens into the real one. -->
  {#if !(run && (workflow || workflowState.loaded))}
    <div aria-label="Loading workflow run" class="loading" role="status">
      <Skeleton class="h-4 w-56" />
      <Skeleton class="h-[26px] w-full" />
      <Skeleton class="h-[26px] w-full" />
    </div>
  {:else}
    <!-- What the tab cannot say, before the run: it stands at the page's
         edge as a transcript's prose does, clear of the run's lines. -->
    <header class="head">
      <div class="facts">
        <p class="started">Started {startedAt}</p>
        {#if inputs.length}
          <dl class="inputs">
            {#each inputs as [key, value] (key)}
              <div>
                <dt>{key}</dt>
                <dd class:code={typeof value !== "string"}>{shown(value)}</dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>
      <div class="actions">
        {#if going}
          <Button
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
            failed={errorMessage !== ""}
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
          variant="outline"
          >Edit workflow</Button
        >
      </div>
    </header>

    <RunBlock here more={rerunFrom} {runId} />

    {#if run.status === "waiting" && run.ask}
      {@const ask = run.ask}
      <!-- The question folds open; answered, the picked option pends until
           the hub moves the run on, and then the block folds away. -->
      <div class="answer" in:unfold out:unfold>
        <Card.Root size="sm">
          <Card.Header>
            <Card.Title>{ask.question}</Card.Title>
          </Card.Header>
          <Card.Content class="answer-body">
            {#if ask.options.length}
              <!-- Peers the workflow's author wrote, none of them the
                   recommended action: each an outline button, its
                   description beside it. -->
              <ul class="options">
                {#each ask.options as option (option.label)}
                  {@const key = `answer:${option.label}`}
                  <li>
                    <Button
                      disabled={(busy && acting !== key) || !live}
                      failed={errorMessage !== ""}
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
                      <p class="hint">{option.description}</p>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="field">
              <Label for="run-note-{runId}">Note (optional)</Label>
              <Input id="run-note-{runId}" bind:value={note} />
            </div>
            {#if ask.answerSchema}
              <!-- A typed answer: its JSON is checked by the hub against the
                   schema the program declared, shown here as the placeholder. -->
              <div class="field">
                <Label for="run-value-{runId}">Answer value (JSON)</Label>
                <Textarea
                  id="run-value-{runId}"
                  placeholder={JSON.stringify(ask.answerSchema)}
                  rows={3}
                  bind:value={valueText}
                />
              </div>
              {#if !ask.options.length}
                <div class="send">
                  <Button
                    disabled={!valueText.trim() ||
                      (busy && acting !== "value") ||
                      !live}
                    failed={errorMessage !== ""}
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
              {/if}
            {/if}
            {#if ask.allowOther}
              <div class="field">
                <Label for="run-other-{runId}">Other answer</Label>
                <div class="other">
                  <Input id="run-other-{runId}" bind:value={other} />
                  <Button
                    disabled={!other || (busy && acting !== "answer") || !live}
                    failed={errorMessage !== ""}
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
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    {/if}

    {#if logLines.length}
      <details class="log" bind:open={logOpen} in:unfold out:unfold>
        <summary>Log · <span class="num">{logLines.length}</span></summary>
        <!-- A line arrives the house way (motion/rows), and the log keeps
             the newest in view only while the reader is at its end. -->
        <ol {@attach reflow()} {@attach followTail()}>
          {#each logLines as line (line.seq)}
            <li data-flip>
              <time class="num">{new Date(line.at).toLocaleTimeString()}</time
              ><span>{line.text}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  {/if}
</div>

<style>
  /* The tab's column: the transcript's own ledger padding and field, so a
     run reads in the place a conversation would. */
  .run-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    padding: var(--space-6) var(--space-6) var(--space-7) var(--space-7);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font-size: var(--text-body);
    font-weight: var(--weight-body);

    @media (width <= 900px) {
      padding-inline: var(--space-5);
    }
  }
  /* The run's block draws its own rail-row gap; the column's gap stands for it. */
  .run-view > :global(.run-block) {
    --rail-gap: 0px;
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-3) var(--space-5);
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    font-size: var(--text-meta);
    line-height: var(--leading-meta);
  }
  .started {
    margin: 0;
    color: var(--ink-muted);
  }
  .inputs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    margin: 0;

    & > div {
      display: contents;
    }
    & dt {
      color: var(--ink-muted);
    }
    & dd {
      margin: 0;
      max-inline-size: 72ch;
      color: var(--ink-strong);
      overflow-wrap: anywhere;
    }
    & dd.code {
      font-family: var(--font-mono);
      font-variant-ligatures: none;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .answer {
    max-inline-size: 72ch;
  }
  .answer :global(.answer-body) {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;

    & li {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
      min-inline-size: 0;
    }
  }
  .hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    line-height: var(--leading-meta);
    overflow-wrap: anywhere;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .other {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .send {
    display: flex;
  }
  /* Left as a list-item so the native disclosure marker survives: a flex
     summary silently loses the triangle, and then nothing says it opens. */
  .log summary {
    padding-block: var(--space-2);
    cursor: pointer;
    color: var(--ink-muted);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  /* Open, the log is one fixed height: lines arriving fill and scroll it,
     and never push the run below it down. */
  .log ol {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) 0 0;
    list-style: none;
    block-size: 30dvh;
    overflow-y: auto;
  }
  .log li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    overflow-wrap: anywhere;
  }
  .log time {
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  /* DESIGN.md: every affordance reaches 44px under a coarse pointer. */
  @media (pointer: coarse) {
    .log summary {
      padding-block: var(--space-4);
    }
  }
</style>
