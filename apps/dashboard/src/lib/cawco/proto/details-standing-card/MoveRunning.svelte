<script lang="ts">
  /**
   * Move, running: its steps drawn as a line, each done, live or to come;
   * the step it is on with its files and bytes as a meter; the
   * conversations it waits on to end a turn, each with Interrupt now; and,
   * only when so, that it holds for a machine that is away, or the step
   * that failed with the tool's words, the state of both folders and Try
   * this step again. Call it off stands until the old folder starts to be
   * removed. Back leaves the move running: its place's row shows its step.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { IconError, IconNotYet, IconSuccess } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { MoveRun } from "./details";
  import Face from "./Face.svelte";
  import Group from "./Group.svelte";
  import { standingWords } from "./words";

  const words = standingWords.running;

  let {
    form,
    run,
    oninterrupt,
    onagain,
    oncalloff,
    onback,
  }: {
    form: "card" | "sheet";
    run: MoveRun;
    oninterrupt: (id: string) => void;
    onagain: () => void;
    oncalloff: () => void;
    onback: () => void;
  } = $props();

  const step = $derived(run.steps[run.at] ?? "");
  /** The old folder is being removed: past the point a move can be called off. */
  const removing = $derived(step === "Remove old folder");
</script>

<Face {form} {onback} title={words.title}>
  {#snippet lead()}
    <ol
      class={[
        "m-0 grid min-w-0 list-none gap-space-2 p-0",
        form === "card" ? "grid-cols-6" : "grid-cols-3",
      ]}
      aria-label={words.title}
    >
      {#each run.steps as name, index (name)}
        <!-- mark-line: a step's mark stands over its name, so the steps read as one line of marks -->
        <li
          aria-current={index === run.at ? "step" : undefined}
          class="flex min-w-0 flex-col gap-space-1"
        >
          <span class="flex h-lh items-center type-label">
            {#if index < run.at}
              <IconSuccess
                aria-hidden="true"
                class="size-icon-sm text-status-done-ink"
              />
            {:else if index === run.at && run.failed}
              <IconError
                aria-hidden="true"
                class="size-icon-sm text-status-fail-ink"
              />
            {:else if index === run.at}
              <LiveDot size="row" />
            {:else}
              <IconNotYet
                aria-hidden="true"
                class="size-icon-sm text-ink-subtle"
              />
            {/if}
          </span>
          <span
            class={[
              "type-meta text-pretty",
              index === run.at ? "text-ink-strong" : "text-ink-muted",
            ]}>{name}</span
          >
        </li>
      {/each}
    </ol>
    {#if run.files && run.bytes && !run.failed}
      <div class="flex min-w-0 flex-col gap-space-2" aria-live="polite">
        <div class="flex min-w-0 items-baseline gap-space-3 type-meta">
          <span class="type-label text-ink-strong">{step}</span>
          <span class="text-ink-muted tabular-nums"
            >{words.files(run.files.done, run.files.total)}</span
          >
          <span class="ms-auto text-ink-muted tabular-nums"
            >{words.bytes(run.bytes.done, run.bytes.total)}</span
          >
        </div>
        <Progress
          aria-label={step}
          max={run.bytes.total}
          value={run.bytes.done}
        />
      </div>
    {/if}
    {#if run.holding}
      <Alert variant="warning">
        <AlertDescription>{words.holding(run.holding)}</AlertDescription>
      </Alert>
    {/if}
    {#if run.failed}
      <Alert variant="destructive">
        <AlertTitle>{words.failed(step)}</AlertTitle>
        <AlertDescription>
          <span class="block">{run.failed.words}</span>
          <span class="block">{words.oldFolder}: {run.failed.oldFolder}</span>
          <span class="block">{words.newFolder}: {run.failed.newFolder}</span>
        </AlertDescription>
        <AlertAction>
          <Button onclick={onagain} size="sm" variant="outline"
            >{words.again}</Button
          >
        </AlertAction>
      </Alert>
    {/if}
    {#if run.waiting.length > 0}
      <Group title={words.waiting}>
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-2 p-0">
          {#each run.waiting as one (one.id)}
            <li class="flex min-w-0 items-center gap-space-3" in:reveal>
              <span
                class="mark-line flex min-w-0 flex-auto items-center gap-space-2"
              >
                <LiveDot data-box size="row" />
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                  >{one.title}</span
                >
              </span>
              <Button
                onclick={() => oninterrupt(one.id)}
                size="xs"
                variant="outline">{words.interrupt}</Button
              >
            </li>
          {/each}
        </ul>
      </Group>
    {/if}
    <p class="m-0 type-meta text-ink-muted text-pretty">{words.goesOn}</p>
  {/snippet}
  {#snippet acts()}
    {#if !removing}
      <Button onclick={oncalloff} size="sm" variant="destructive"
        >{words.callOff}</Button
      >
    {/if}
  {/snippet}
</Face>
