<script lang="ts">
  import RunStatus from "#lib/cawco/routines/RunStatus.svelte";
  import PageSurface from "#lib/cawco/side/PageSurface.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  /**
   * One routine opened: beside the Routines page on a desk, the page itself
   * on a phone. It leads with what needs the person, when anything does,
   * then its newest run whole (designing-first-views, two levels deep);
   * under it what each run does (and, for one that waits for something,
   * what it waits for, how it finds out and what it holds), when it runs,
   * its earlier runs, and who made it. Its bar runs it now, pauses or
   * resumes it, opens it to edit by hand, and changes it by telling Caw.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChatLinear,
    IconNeedsYou,
    IconPauseLinear,
    IconPenLinear,
    IconPlayLinear,
  } from "#lib/icons.js";
  import type { ShapeRoutine } from "./shape-data";

  let {
    routine,
    phone = false,
    onclose,
    onrun,
    onpause,
    onkeep,
    onchange,
    onedit,
  }: {
    routine: ShapeRoutine;
    phone?: boolean;
    onclose: () => void;
    onrun: (id: string) => void;
    onpause: (id: string) => void;
    onkeep: (id: string) => void;
    /** Change with Caw: the project's conversation, the routine named. */
    onchange: (id: string) => void;
    /** Edit by hand: its form, filled. */
    onedit: (id: string) => void;
  } = $props();

  const newest = $derived(routine.runs[0] ?? null);
  const earlier = $derived(routine.runs.slice(1));
</script>

{#snippet bar()}
  <BarGlass form="group">
    <BarItem
      icon={IconPlayLinear}
      label="Run now"
      onclick={() => onrun(routine.id)}
      tip={routine.running ? "A run is going" : "Run now"}
    />
    <BarItem
      icon={routine.paused ? IconPlayLinear : IconPauseLinear}
      label={routine.paused ? "Resume" : "Pause"}
      onclick={() => onpause(routine.id)}
    />
    <BarItem
      icon={IconPenLinear}
      label="Edit"
      onclick={() => onedit(routine.id)}
    />
    <BarItem
      icon={IconChatLinear}
      label="Change with Caw"
      onclick={() => onchange(routine.id)}
    />
  </BarGlass>
{/snippet}

{#snippet facts(rows: [string, string | null][])}
  <dl
    class="m-0 grid grid-cols-(--facts) gap-x-space-4 gap-y-space-2"
    style:--facts="calc(var(--spacing) * 32) minmax(0, 1fr)"
  >
    {#each rows.filter(([, value]) => value !== null) as [term, value] (term)}
      <dt class="type-meta text-ink-subtle">{term}</dt>
      <dd class="m-0 type-meta wrap-anywhere text-ink-row">{value}</dd>
    {/each}
  </dl>
{/snippet}

{#snippet content()}
  <div
    class="flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain pt-(--side-room)"
  >
    <div
      class="flex flex-col gap-space-7 px-space-5 pt-space-2 pb-space-8 max-phone:px-space-4"
    >
      {#if phone}
        <div class="flex flex-wrap gap-space-2">
          <Button
            label="Run now"
            onclick={() => onrun(routine.id)}
            size="sm"
            variant="outline"
          />
          <Button
            label={routine.paused ? "Resume" : "Pause"}
            onclick={() => onpause(routine.id)}
            size="sm"
            variant="outline"
          />
          <Button
            label="Edit"
            onclick={() => onedit(routine.id)}
            size="sm"
            variant="outline"
          />
          <Button
            label="Change with Caw"
            onclick={() => onchange(routine.id)}
            size="sm"
            variant="outline"
          />
        </div>
      {/if}
      {#if routine.ask}
        <section
          aria-label="Needs you"
          class="flex flex-col gap-space-3 rounded-md bg-status-attn-bg px-space-4 py-space-3"
        >
          <p
            class="mark-line m-0 flex items-start gap-space-2 type-body text-ink-strong"
          >
            <IconNeedsYou
              aria-hidden="true"
              class="mt-px size-icon-md flex-none text-status-attn-glyph"
            />
            <span>{routine.sentence}</span>
          </p>
          {#if routine.action}
            <div class="flex flex-col gap-space-2 ps-space-6">
              <p class="m-0 type-body text-ink-row">
                {routine.action.sentence}
              </p>
              {@render facts([
                [
                  "Acts as",
                  `${routine.action.account} on ${routine.action.service}`,
                ],
                ["The call", routine.action.call],
                ["Runs", routine.action.runs],
              ])}
              <div
                class="flex items-center justify-between gap-space-3 pt-space-1"
              >
                <Button label="Deny" size="sm" variant="outline" />
                <Button label="Approve" size="sm" variant="outline" />
              </div>
            </div>
          {:else if routine.wait}
            <div class="flex flex-wrap gap-space-2 ps-space-6">
              <Button label="Keep looking until…" size="sm" variant="outline" />
              <Button label="Look again now" size="sm" variant="outline" />
              <Button label="Mark it met" size="sm" variant="outline" />
            </div>
          {:else if routine.ask.does === "keep"}
            <div class="flex flex-wrap gap-space-2 ps-space-6">
              <Button
                label="Keep"
                onclick={() => onkeep(routine.id)}
                size="sm"
                variant="outline"
              />
              <Button label="Turn off" size="sm" variant="outline" />
            </div>
          {:else}
            <div class="flex flex-wrap gap-space-2 ps-space-6">
              <Button
                label="Run again"
                onclick={() => onrun(routine.id)}
                size="sm"
                variant="outline"
              />
              <Button
                label="Ask Caw about it"
                onclick={() => onchange(routine.id)}
                size="sm"
                variant="outline"
              />
            </div>
          {/if}
        </section>
      {/if}

      {#if newest}
        <section aria-label="Newest run" class="flex flex-col gap-space-2">
          <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
            <h3 class="m-0 type-label text-ink-strong">Newest run</h3>
            <RunStatus status={newest.status} text={newest.when} />
            <span class="type-meta text-ink-subtle"
              >{newest.by} · {newest.took}</span
            >
            {#if newest.session}
              <Button
                class="ms-auto"
                label="Open session"
                size="xs"
                variant="ghost"
              />
            {/if}
          </div>
          {#if routine.wait}
            <figure class="m-0 flex flex-col gap-space-1">
              <figcaption class="type-meta text-ink-subtle">
                {routine.wait.saidBy}:
              </figcaption>
              <blockquote
                class="m-0 border-s-2 border-border-hairline ps-space-3 type-body wrap-anywhere text-ink-row"
              >
                {newest.words}
              </blockquote>
            </figure>
          {:else}
            <p class="m-0 type-body wrap-anywhere text-ink-row">
              {newest.words}
            </p>
          {/if}
        </section>
      {/if}

      <section aria-label="What it does" class="flex flex-col gap-space-3">
        <h3 class="m-0 type-label text-ink-strong">What it does</h3>
        <p class="m-0 type-body text-ink-row">{routine.does}</p>
        {#if routine.wait}
          {@const wait = routine.wait}
          {@render facts([
            ["Done when", wait.statement],
            [
              "How it finds out",
              wait.how === "command"
                ? "Runs this command; exit 0 means yes"
                : "A model reads and judges, each run",
            ],
          ])}
          {#if wait.command}
            <pre
              class="m-0 overflow-x-auto rounded-sm bg-surface-recess px-space-3 py-space-2 type-code whitespace-pre-wrap wrap-anywhere text-ink-strong">{wait.command}</pre>
            <p class="m-0 type-meta text-ink-subtle">
              Exit 0 means it's met. 124, 126, 127 or a signal mean it couldn't
              check. Anything else means not yet.
            </p>
          {/if}
          {@render facts([
            [
              "Holding",
              [
                ...wait.holds.map((task) => `${task.id} ${task.title}`),
                ...(wait.steps > 0 ? [`${wait.steps} plan steps`] : []),
              ].join(" · ") ||
                "Nothing: it won't look until something waits on it",
            ],
            ["Gives up", wait.until],
          ])}
        {/if}
      </section>

      <section aria-label="When it runs" class="flex flex-col gap-space-3">
        <h3 class="m-0 type-label text-ink-strong">When it runs</h3>
        {@render facts([
          ["Rhythm", routine.rhythm],
          ["Next", routine.ahead.length > 0 ? routine.ahead.join(" · ") : null],
          ["Also starts on", routine.alsoStarts],
          ["Won't run", routine.held],
        ])}
      </section>

      {#if earlier.length > 0}
        <section aria-label="Earlier runs" class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">Earlier runs</h3>
          <ol class="m-0 flex list-none flex-col gap-space-2 p-0">
            {#each earlier as run (run.id)}
              <li
                class="grid grid-cols-(--run) items-baseline gap-x-space-3"
                style:--run="calc(var(--spacing) * 36) minmax(0, 1fr)"
              >
                <RunStatus status={run.status} text={run.when} />
                <span class="truncate type-meta text-ink-row" title={run.words}
                  >{run.words}</span
                >
              </li>
            {/each}
          </ol>
          <Button
            class="-ms-space-2 self-start"
            label="All {routine.runsTotal} runs"
            size="xs"
            variant="ghost"
          />
        </section>
      {/if}

      <section aria-label="Made by" class="flex flex-col gap-space-2">
        {@render facts([["Made by", routine.madeBy]])}
        {#if routine.madeWhy}
          <blockquote
            class="m-0 border-s-2 border-border-hairline ps-space-3 type-meta text-ink-muted"
          >
            {routine.madeWhy}
          </blockquote>
        {/if}
        <p class="m-0 type-meta text-ink-subtle">{routine.spend}</p>
      </section>
    </div>
  </div>
{/snippet}

{#if phone}
  <PageSurface
    backTo="Routines"
    label={routine.name}
    {onclose}
    title={routine.name}
  >
    {@render content()}
  </PageSurface>
{:else}
  <SideSurface
    actions={bar}
    label={routine.name}
    of="task"
    {onclose}
    recessed={false}
    title={routine.name}
  >
    {@render content()}
  </SideSurface>
{/if}
