<script lang="ts">
  /**
   * A folder step, the card's body become the step (Move files, Locate
   * folder, Connect existing folder, Copy to computer): one layout for all
   * four. The folder acted on travels from the card to its top. Where to
   * takes a computer of the fleet as a chip and a typed folder; What will
   * happen is written from those two answers before anything runs, or says
   * what stands in the way and what to do, the act then sunk; Agents
   * working here now names each agent, and to another computer whether it
   * keeps its conversation or continues from a summary, and why. Cancel,
   * and the step's one act, named for it, the one coral act of the view.
   *
   * While it runs, the stage it is on and how far along take the place of
   * the groups under What moves, with Call off until the old folder starts
   * to be removed; closing the card leaves it running. After, what was
   * checked, each agent running again, anything left behind with why and
   * Try again, what ended with it, and Done.
   */
  import {
    actWords,
    folderWords,
    stepWords,
  } from "@cawco/core/words/project-details";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconError,
    IconHourglass,
    IconNotYet,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type {
    Computer,
    Folder,
    FolderStepFacts,
    FolderStepState,
  } from "./details";
  import FolderRow from "./FolderRow.svelte";
  import StepGroup from "./StepGroup.svelte";

  let {
    step,
    onstep,
    facts,
    folder,
    fleet,
    holders = [],
    sunk = false,
    oncancel,
    onrun,
    oninterrupt,
    oncalloff,
    ontrystage,
    ontryleft,
    ondone,
  }: {
    step: FolderStepState;
    /** The person's answers, changed. */
    onstep: (next: FolderStepState) => void;
    facts: FolderStepFacts;
    /** The folder acted on; none for Connect existing folder and Copy to computer. */
    folder: Folder | null;
    fleet: Computer[];
    /** The computers that already hold the project's code: Copy to computer can't pick them. */
    holders?: string[];
    sunk?: boolean;
    oncancel: () => void;
    onrun: () => void;
    oninterrupt: (agentId: string) => void;
    oncalloff: () => void;
    ontrystage: () => void;
    ontryleft: (name: string) => void;
    ondone: () => void;
  } = $props();

  const act = $derived(actWords[step.act]);
  /** Copy to computer and the computer already holds the code: said on its chip, before any press. */
  const holds = (id: string) => step.act === "copy" && holders.includes(id);
  const locating = $derived(step.act === "locate");
  /** The computer the folder ends on: Locate keeps the folder's own. */
  const target = $derived(
    locating ? (folder?.machine.id ?? null) : step.machineId
  );
  const elsewhere = $derived(
    folder !== null && target !== null && target !== folder.machine.id
  );
  const ready = $derived(
    facts.forecast.state === "ready" && !sunk && !facts.sending
  );
  const hueOf = (id: string) =>
    Math.max(
      0,
      fleet.findIndex((c) => c.id === id)
    );
</script>

<div
  class="flex min-w-0 flex-col gap-space-5"
  data-step="folder"
  data-act={step.act}
>
  {#if folder}
    <StepGroup name={locating ? stepWords.thisFolder : stepWords.whatMoves}>
      <FolderRow
        {folder}
        hue={hueOf(folder.machine.id)}
        onact={() => undefined}
        oncancel={() => undefined}
        onconfirm={() => undefined}
        oncalloff={() => undefined}
        ondisconnect={() => undefined}
        ontoggle={() => undefined}
        still
        {sunk}
      />
    </StepGroup>
  {/if}

  {#if facts.phase === "edit"}
    <div
      class="grid grid-cols-1 gap-x-space-7 gap-y-space-5 @min-details-card/card:grid-cols-2"
      in:crossIn
    >
      <div class="flex min-w-0 flex-col gap-space-5">
        <StepGroup name={stepWords.whereTo}>
          <OptionGroup
            aria-label={stepWords.whereTo}
            bind:value={
              () => (target ? [target] : []),
              (next) => {
                if (!locating) {
                  onstep({ ...step, machineId: next[0] ?? null });
                }
              }
            }
            disabled={locating || sunk}
            glide
          >
            {#each fleet as computer (computer.id)}
              <OptionGroupItem
                disabled={!computer.online || holds(computer.id)}
                value={computer.id}
              >
                <span class="mark-line flex items-center gap-space-2">
                  <OsMark
                    aria-hidden="true"
                    class="size-icon-sm flex-none"
                    os={computer.os}
                  />
                  <span>{computer.name}</span>
                  {#if holds(computer.id)}
                    <span class="type-meta text-ink-muted"
                      >{stepWords.hasCode}</span
                    >
                  {:else if !computer.online}
                    <span class="type-meta text-ink-muted"
                      >{folderWords.offline}</span
                    >
                  {/if}
                </span>
              </OptionGroupItem>
            {/each}
          </OptionGroup>
          <label class="flex flex-col gap-space-1">
            <span class="type-meta text-ink-muted">{stepWords.folderLabel}</span
            >
            <Input
              aria-label={stepWords.folderLabel}
              autocomplete="off"
              disabled={sunk}
              face="mono"
              placeholder={stepWords.folderPlaceholder}
              spellcheck="false"
              text="meta"
              bind:value={
                () => step.path, (path) => onstep({ ...step, path: path ?? "" })
              }
            />
          </label>
        </StepGroup>

        {#if facts.tell}
          <StepGroup name={stepWords.whatTell}>
            <p class="m-0 type-meta text-pretty text-ink-strong">
              {facts.tell}
            </p>
          </StepGroup>
        {/if}
      </div>

      <div class="flex min-w-0 flex-col gap-space-5">
        <StepGroup name={stepWords.whatHappens}>
          <div aria-live="polite" class="flex flex-col gap-space-2">
            {#if facts.forecast.state === "none"}
              <p class="m-0 type-meta text-pretty text-ink-muted">
                {stepWords.pickFirst}
              </p>
            {:else if facts.forecast.state === "checking"}
              <p
                class="mark-line m-0 flex items-center gap-space-2 type-meta text-ink-strong"
              >
                <Spinner box="small" tone="muted" /><span
                  >{stepWords.checking(facts.forecast.machine)}</span
                >
              </p>
            {:else if facts.forecast.state === "ready"}
              <ul
                class="m-0 flex list-none flex-col gap-space-2 p-0"
                in:crossIn
              >
                {#each facts.forecast.lines as line (line)}
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
            {:else}
              <!-- mark-line: the glyph stands at the top of words that may wrap -->
              <p
                class="m-0 flex items-start gap-space-2 type-meta text-pretty text-status-fail-ink"
                in:crossIn
              >
                <IconError
                  aria-hidden="true"
                  class="mt-px size-icon-sm flex-none"
                />
                <span>{facts.forecast.why}</span>
              </p>
              {#if facts.forecast.todo}
                <p class="m-0 ps-space-5 type-meta text-pretty text-ink-strong">
                  {facts.forecast.todo}
                </p>
              {/if}
            {/if}
          </div>
        </StepGroup>

        {#if facts.agents.length > 0}
          <StepGroup name={stepWords.agentsHere(facts.agents.length)}>
            <p class="m-0 type-meta text-pretty text-ink-muted">
              {stepWords.agentsLine}
            </p>
            <ul class="m-0 flex list-none flex-col gap-space-5 p-0">
              {#each facts.agents as agent (agent.id)}
                {@const way = step.summaries.includes(agent.id)
                  ? "summary"
                  : agent.carry.way}
                <li class="flex flex-col gap-space-2">
                  <span
                    class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
                  >
                    <span class="min-w-0 flex-1 type-label text-ink-strong"
                      >{agent.name}</span
                    >
                    {#if agent.replying}
                      <Button
                        onclick={() => oninterrupt(agent.id)}
                        size="xs"
                        variant="outline">{stepWords.interrupt}</Button
                      >
                    {/if}
                  </span>
                  {#if agent.replying}
                    <span
                      class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
                      ><IconHourglass
                        aria-hidden="true"
                        class="size-icon-sm flex-none"
                      /><span>{stepWords.replying}</span></span
                    >
                  {/if}
                  {#if elsewhere}
                    <OptionGroup
                      aria-label={stepWords.followsHow(agent.name)}
                      bind:value={
                        () => [way],
                        (next) => {
                          const summaries = step.summaries.filter(
                            (id) => id !== agent.id
                          );
                          onstep({
                            ...step,
                            summaries:
                              next[0] === "summary" &&
                              agent.carry.way === "same"
                                ? [...summaries, agent.id]
                                : summaries,
                          });
                        }
                      }
                      disabled={sunk}
                    >
                      <OptionGroupItem
                        disabled={agent.carry.way === "summary"}
                        value="same">{stepWords.same}</OptionGroupItem
                      >
                      <OptionGroupItem value="summary"
                        >{stepWords.summary}</OptionGroupItem
                      >
                    </OptionGroup>
                    <span class="type-meta text-pretty text-ink-muted"
                      >{agent.carry.why
                        ? `${agent.carry.why} `
                        : ""}{stepWords.on(agent.carry.tool)}</span
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          </StepGroup>
        {/if}
      </div>
    </div>

    {#if facts.refused}
      <RowFault again={onrun} reason={facts.refused} />
    {/if}
    <div class="flex flex-wrap items-center justify-between gap-space-2">
      <Button onclick={oncancel} size="sm" variant="outline"
        >{stepWords.cancel}</Button
      >
      <Button
        disabled={!ready}
        onclick={onrun}
        pending={facts.sending}
        size="sm">{act.name}</Button
      >
    </div>
  {:else if facts.phase === "running" && facts.run}
    {@const run = facts.run}
    <div class="flex flex-col gap-space-4" in:crossIn>
      <StepGroup name={stepWords.whileRuns}>
        <ol
          class="m-0 flex list-none flex-col gap-space-2 p-0"
          aria-live="polite"
        >
          {#each run.stages as stage, at (stage)}
            <li
              class="mark-line flex items-center gap-space-2 type-label"
              aria-current={at === run.at ? "step" : undefined}
            >
              {#if at < run.at}
                <IconSuccess
                  aria-hidden="true"
                  class="size-icon-md flex-none text-status-done-ink"
                />
                <span class="text-ink-muted">{stage}</span>
              {:else if at === run.at && run.failed}
                <IconError
                  aria-hidden="true"
                  class="size-icon-md flex-none text-status-fail-ink"
                />
                <span class="text-ink-strong">{stage}</span>
              {:else if at === run.at}
                <span
                  class="grid size-icon-md flex-none place-items-center"
                  data-box><LiveDot /></span
                >
                <span class="text-ink-strong">{stage}</span>
                {#if run.progress}
                  <span class="type-meta tabular-nums text-ink-muted"
                    >{run.progress}</span
                  >
                {/if}
              {:else}
                <IconNotYet
                  aria-hidden="true"
                  class="size-icon-md flex-none text-ink-subtle"
                />
                <span class="text-ink-subtle">{stage}</span>
              {/if}
            </li>
          {/each}
        </ol>
      </StepGroup>
      {#if run.waitingFor}
        <!-- mark-line: the glyph stands at the top of words that may wrap -->
        <p
          class="m-0 flex items-start gap-space-2 type-meta text-pretty text-status-attn-ink"
          transition:unfold
        >
          <IconWarningTriangle
            aria-hidden="true"
            class="mt-px size-icon-sm flex-none"
          />
          <span>{stepWords.waiting(run.waitingFor)}</span>
        </p>
      {/if}
      {#if run.failed}
        <div class="flex flex-col gap-space-2" transition:unfold>
          <p class="m-0 type-label text-status-fail-ink">
            {stepWords.stageFailed(run.failed.stage)}
          </p>
          <p class="m-0 font-mono type-meta text-pretty text-ink-strong">
            {run.failed.words}
          </p>
          <p class="m-0 type-meta text-pretty text-ink-muted">
            {run.failed.folders}
          </p>
        </div>
      {/if}
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <span class="type-meta text-ink-muted">{stepWords.leaveRunning}</span>
        {#if run.failed}
          <Button onclick={ontrystage} size="sm">{stepWords.tryStage}</Button>
        {:else if run.callOff}
          <Button onclick={oncalloff} size="sm" variant="outline"
            >{stepWords.callOff}</Button
          >
        {/if}
      </div>
    </div>
  {:else if facts.phase === "after" && facts.after}
    {@const after = facts.after}
    <div
      class="grid grid-cols-1 gap-x-space-7 gap-y-space-5 @min-details-card/card:grid-cols-2"
      in:crossIn
    >
      <StepGroup name={stepWords.after}>
        <!-- mark-line: the glyph stands at the top of words that may wrap -->
        <p
          class="m-0 flex items-start gap-space-2 type-label text-pretty text-ink-strong"
        >
          <IconSuccess
            aria-hidden="true"
            class="mt-px size-icon-md flex-none text-status-done-ink"
          />
          <span>{after.checked}</span>
        </p>
        <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each after.agents as agent (agent.name)}
            <!-- mark-line: the glyph stands at the top of words that may wrap -->
            <li class="flex items-start gap-space-2 type-meta text-ink-strong">
              {#if agent.resumed}
                <LiveDot />
                <span>{agent.name} · {stepWords.resumed}</span>
              {:else}
                <IconWarningTriangle
                  aria-hidden="true"
                  class="mt-px size-icon-sm flex-none text-status-attn-ink"
                />
                <span class="text-pretty">{agent.name} · {agent.why}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </StepGroup>
      <div class="flex min-w-0 flex-col gap-space-5">
        {#if after.leftBehind.length > 0}
          <StepGroup name={stepWords.leftBehind}>
            {#each after.leftBehind as item (item.name)}
              <div class="flex flex-col">
                <span class="font-mono type-meta text-ink-strong"
                  >{item.name}</span
                >
                <RowFault
                  again={() => ontryleft(item.name)}
                  live={false}
                  reason={item.why}
                />
              </div>
            {/each}
          </StepGroup>
        {/if}
        {#if after.ended.length > 0}
          <StepGroup name={stepWords.ended}>
            <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
              {#each after.ended as item (item)}
                <li class="type-meta text-pretty text-ink-strong">{item}</li>
              {/each}
            </ul>
          </StepGroup>
        {/if}
      </div>
    </div>
    <div class="flex justify-end">
      <Button onclick={ondone} size="sm">{stepWords.done}</Button>
    </div>
  {/if}
</div>
