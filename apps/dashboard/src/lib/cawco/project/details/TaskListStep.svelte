<script lang="ts">
  import { connectWords } from "@cawco/core/words/project-details";
  /**
   * The Connect task list step, the card's body become the step, for GitHub
   * Issues or Linear: what connecting does in four short lines; the
   * sign-in, every one that can serve as a row with the account behind it,
   * or what kind is needed and where to add one; the codebase or team, the
   * project's own first as chips and a typed search for the rest; and for
   * GitHub, optionally a status board and, for each task step, the column
   * that stands for it. Then Cancel and Start updating (Save, when changing
   * it later). What was picked stays picked through a refusal, which stands
   * beside the group that failed in the service's own words.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArrowUpRight, IconFolderGit } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { TaskStepFacts, TaskStepState } from "./details";
  import SignInRows from "./SignInRows.svelte";
  import StepGroup from "./StepGroup.svelte";

  let {
    step,
    onstep,
    facts,
    sunk = false,
    oncancel,
    onstart,
    onsearch,
    ontry,
  }: {
    step: TaskStepState;
    /** The person's answers, changed. */
    onstep: (next: TaskStepState) => void;
    facts: TaskStepFacts;
    sunk?: boolean;
    oncancel: () => void;
    onstart: () => void;
    /** The typed words the rest of the codebases or teams are found by. */
    onsearch: (words: string) => void;
    ontry: () => void;
  } = $props();

  const service = $derived(step.provider === "github" ? "GitHub" : "Linear");
  const LEAVE = "leave";
  const board = $derived(
    facts.boards.state === "read"
      ? facts.boards.value.find((b) => b.id === step.board)
      : undefined
  );
  /** Each task step's column, by step: what the person set, else the column named as the step, else Leave alone. */
  const columnOf = (stage: string): string =>
    step.columns[stage] ??
    (stage in step.columns
      ? null
      : board?.columns.find(
          (column) => column.name.toLowerCase() === stage.toLowerCase()
        )?.id) ??
    LEAVE;
  let typed = $state("");
  const own = $derived(
    facts.targets.state === "read"
      ? facts.targets.value.filter((t) => t.own)
      : []
  );
  const others = $derived(
    facts.targets.state === "read"
      ? facts.targets.value.filter((t) => !t.own)
      : []
  );
  const canStart = $derived(
    step.signIn !== null && step.target !== null && !facts.starting && !sunk
  );
</script>

<div
  class="flex min-w-0 flex-col gap-space-5"
  data-step="tasks"
  data-provider={step.provider}
>
  <div
    class="grid grid-cols-1 gap-x-space-7 gap-y-space-5 @min-details-card/card:grid-cols-2"
  >
    <div class="flex min-w-0 flex-col gap-space-5">
      <StepGroup name={connectWords.what}>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each connectWords.lines(service) as line (line)}
            <li
              class="flex items-start gap-space-2 type-meta text-pretty text-ink-strong"
            >
              <span
                aria-hidden="true"
                class="mt-space-2 size-1 flex-none rounded-pill bg-ink-muted"
              ></span>
              {line}
            </li>
          {/each}
        </ul>
      </StepGroup>

      <StepGroup name={connectWords.signIn}>
        {#if facts.signIns.state === "reading"}
          <Skeleton height="item" />
          <Skeleton height="item" />
        {:else if facts.signIns.state === "failed"}
          <RowFault again={ontry} reason={facts.signIns.reason} />
        {:else if facts.signIns.value.length === 0}
          <p class="m-0 type-meta text-pretty text-ink-strong">
            {connectWords.noSignIn(service)}
          </p>
          <div>
            <Button href="/config/connections" size="sm" variant="outline"
              ><span>{connectWords.addSignIn}</span><IconArrowUpRight
                data-icon="inline-end"
              /></Button
            >
          </div>
        {:else}
          <div in:crossIn>
            <SignInRows
              chosen={step.signIn}
              label={connectWords.signIn}
              onchoose={(signIn) => onstep({ ...step, signIn })}
              signIns={facts.signIns.value}
              {sunk}
            />
          </div>
        {/if}
      </StepGroup>
    </div>

    <div class="flex min-w-0 flex-col gap-space-5">
      <StepGroup
        name={step.provider === "github"
          ? connectWords.codebase
          : connectWords.team}
      >
        {#if facts.targets.state === "reading"}
          <Skeleton height="control-sm" />
          <Skeleton height="item" />
        {:else if facts.targets.state === "failed"}
          <RowFault again={ontry} reason={facts.targets.reason} />
        {:else}
          <div class="flex flex-col gap-space-2" in:crossIn>
            <OptionGroup
              aria-label={step.provider === "github"
                ? connectWords.codebase
                : connectWords.team}
              bind:value={
                () => (step.target ? [step.target] : []),
                (next) => onstep({ ...step, target: next[0] ?? null })
              }
              disabled={sunk}
              glide
            >
              {#each [...own, ...others.filter((t) => t.id === step.target)] as target (target.id)}
                <OptionGroupItem value={target.id}>
                  <span class="mark-line flex items-center gap-space-2">
                    <ProviderLogo provider={step.provider} size="meta" /><span
                      >{target.name}</span
                    >
                  </span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>
            {#if others.length > 0}
              <Command.Root>
                <Command.Input
                  oninput={() => onsearch(typed.trim())}
                  placeholder={connectWords.find}
                  bind:value={typed}
                />
                <Command.List>
                  <Command.Empty>{connectWords.noMatch}</Command.Empty>
                  {#each others as target (target.id)}
                    <Command.Item
                      onSelect={() => onstep({ ...step, target: target.id })}
                      value={target.name}
                    >
                      <IconFolderGit /><span>{target.name}</span>
                    </Command.Item>
                  {/each}
                </Command.List>
              </Command.Root>
            {/if}
          </div>
        {/if}
      </StepGroup>

      {#if step.provider === "github"}
        <StepGroup name={connectWords.board}>
          <p class="m-0 type-meta text-pretty text-ink-muted">
            {connectWords.boardLine}
          </p>
          {#if facts.boards.state === "reading"}
            <Skeleton height="control-sm" />
          {:else if facts.boards.state === "refused"}
            <p class="m-0 type-meta text-pretty text-status-attn-ink">
              GitHub: {facts.boards.words}
            </p>
          {:else if facts.boards.state === "failed"}
            <RowFault again={ontry} reason={facts.boards.reason} />
          {:else}
            <OptionGroup
              aria-label={connectWords.board}
              bind:value={
                () => [step.board ?? "none"],
                (next) =>
                  onstep({
                    ...step,
                    board: next[0] === "none" ? null : (next[0] ?? null),
                    columns: {},
                  })
              }
              disabled={sunk}
              glide
            >
              <OptionGroupItem value="none">{connectWords.none}</OptionGroupItem
              >
              {#each facts.boards.value as each (each.id)}
                <OptionGroupItem value={each.id}>{each.name}</OptionGroupItem>
              {/each}
            </OptionGroup>
            {#if board && board.columns.length === 0}
              <p class="m-0 type-meta text-pretty text-ink-muted">
                {connectWords.noColumns(board.name)}
              </p>
            {:else if board}
              <dl class="m-0 flex flex-col gap-space-2" transition:unfold>
                {#each facts.stages as stage (stage)}
                  <div class="flex flex-col gap-space-1">
                    <dt class="type-meta font-medium text-ink-strong">
                      {stage}
                    </dt>
                    <dd class="m-0">
                      <OptionGroup
                        aria-label={connectWords.columnOf(stage)}
                        bind:value={
                          () => [columnOf(stage)],
                          (next) =>
                            onstep({
                              ...step,
                              columns: {
                                ...step.columns,
                                [stage]:
                                  next[0] === LEAVE ? null : (next[0] ?? null),
                              },
                            })
                        }
                        disabled={sunk}
                        glide
                      >
                        {#each board.columns as column (column.id)}
                          <OptionGroupItem value={column.id}
                            >{column.name}</OptionGroupItem
                          >
                        {/each}
                        <OptionGroupItem value={LEAVE}
                          >{connectWords.leave}</OptionGroupItem
                        >
                      </OptionGroup>
                    </dd>
                  </div>
                {/each}
              </dl>
            {/if}
          {/if}
        </StepGroup>
      {/if}
    </div>
  </div>

  {#if facts.refused}
    <RowFault again={onstart} reason="{service}: {facts.refused}" />
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-space-2">
    <Button onclick={oncancel} size="sm" variant="outline"
      >{connectWords.cancel}</Button
    >
    <Button
      disabled={!canStart}
      onclick={onstart}
      pending={facts.starting}
      size="sm">{step.changing ? connectWords.save : connectWords.start}</Button
    >
  </div>
</div>
