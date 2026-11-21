<script lang="ts">
  /**
   * One routine, opened beside the list, in the order the person asks about
   * it: the bar (its name; Edit, Change with Caw, Pause or Turn on, More;
   * then the one act its state calls for); its state, next run and maker
   * over what each run does; why it needs them, while it does; what it looks
   * for, for a routine that looks; its latest run whole and its earlier runs,
   * each opening its whole result in place; when it runs; what its runs
   * asked to do outside; and About, closed. Where the side has room
   * (`@routine-page/routine`), what it looks for and its runs take the wide
   * column and the rest the narrow one.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconChatLinear,
    IconChevronRight,
    IconLinkLinear,
    IconNeedsYou,
    IconPauseLinear,
    IconPenLinear,
    IconPlayLinear,
    IconTrashLinear,
  } from "#lib/icons.js";
  import { HEAD_PRIORITY, type HeadItem } from "../../side/head";
  import SideSurface from "../../side/SideSurface.svelte";
  import type { OutsideAction, Routine } from "./harbor";
  import { sessionHref } from "./harbor";
  import OpenButton from "./OpenButton.svelte";
  import RoutineMark from "./RoutineMark.svelte";
  import RunMark, { RUN_WORDS } from "./RunMark.svelte";
  import RunResult from "./RunResult.svelte";

  let {
    routine,
    actions,
    runId = null,
    onrun,
    onclose,
    onact,
  }: {
    routine: Routine;
    /** What this routine's runs asked to do outside. */
    actions: OutsideAction[];
    /** The earlier run whose whole result stands open in place. */
    runId?: string | null;
    /** An earlier run's Open: its result opens in place, or closes. */
    onrun: (id: string | null) => void;
    onclose: () => void;
    /** An act on the routine, by its words: "Run now", "Edit", "Keep". */
    onact: (act: string) => void;
  } = $props();

  const looks = $derived(routine.looksFor);
  const latest = $derived(routine.runs[0]);
  const earlier = $derived(routine.runs.slice(1));
  const paused = $derived(
    routine.state === "paused" || routine.state === "finished"
  );
  /** The one prominent act its state calls for. */
  const prominent = $derived(
    routine.needs?.choices.find((one) => one.primary)?.label ??
      (routine.state === "paused" ? "Turn on" : "Run now")
  );
  const running = $derived(routine.state === "running");
  const nextWords = $derived(
    "at" in routine.next
      ? `Next ${routine.next.when ? `${routine.next.at} ${routine.next.when}` : routine.next.at}`
      : routine.next.held
  );

  const items = $derived<HeadItem[]>([
    {
      key: "prominent",
      priority: HEAD_PRIORITY.control,
      bar: prominentBar,
      menu: prominentMenu,
      place: "prominent",
    },
    ...(routine.cawco
      ? []
      : [
          {
            key: "caw",
            priority: HEAD_PRIORITY.send,
            bar: cawBar,
            menu: cawMenu,
          },
        ]),
    { key: "edit", priority: HEAD_PRIORITY.mode, bar: editBar, menu: editMenu },
    ...(prominent === "Run now"
      ? []
      : [
          {
            key: "run",
            priority: HEAD_PRIORITY.comments,
            bar: runBar,
            menu: runMenu,
          },
        ]),
    ...(routine.state === "finished" || prominent === "Turn on"
      ? []
      : [
          {
            key: "pause",
            priority: HEAD_PRIORITY.expand,
            bar: pauseBar,
            menu: pauseMenu,
          },
        ]),
    {
      key: "link",
      priority: HEAD_PRIORITY.open,
      bar: linkBar,
      menu: linkMenu,
      place: "more",
    },
    {
      key: "delete",
      priority: HEAD_PRIORITY.open,
      bar: deleteBar,
      menu: deleteMenu,
      place: "more",
    },
  ]);
</script>

{#snippet prominentBar()}
  <Button
    disabled={prominent === "Run now" && running}
    label={prominent}
    onclick={() => onact(prominent)}
    shape="capsule"
    size="sm"
  />
{/snippet}
{#snippet prominentMenu()}
  <DropdownMenu.Item onSelect={() => onact(prominent)}
    >{prominent}</DropdownMenu.Item
  >
{/snippet}
{#snippet editBar()}
  <BarItem icon={IconPenLinear} label="Edit" onclick={() => onact("Edit")} />
{/snippet}
{#snippet editMenu()}
  <DropdownMenu.Item onSelect={() => onact("Edit")}
    ><IconPenLinear /><span>Edit</span></DropdownMenu.Item
  >
{/snippet}
{#snippet cawBar()}
  <BarItem
    icon={IconChatLinear}
    label="Change with Caw"
    onclick={() => onact("Change with Caw")}
  />
{/snippet}
{#snippet cawMenu()}
  <DropdownMenu.Item onSelect={() => onact("Change with Caw")}
    ><IconChatLinear /><span>Change with Caw</span></DropdownMenu.Item
  >
{/snippet}
{#snippet runBar()}
  <BarItem
    icon={IconPlayLinear}
    label="Run now"
    onclick={() => onact("Run now")}
  />
{/snippet}
{#snippet runMenu()}
  <DropdownMenu.Item onSelect={() => onact("Run now")}
    ><IconPlayLinear /><span>Run now</span></DropdownMenu.Item
  >
{/snippet}
{#snippet pauseBar()}
  <BarItem
    icon={paused ? IconPlayLinear : IconPauseLinear}
    label={paused ? "Turn on" : "Pause"}
    onclick={() => onact(paused ? "Turn on" : "Pause")}
  />
{/snippet}
{#snippet pauseMenu()}
  <DropdownMenu.Item onSelect={() => onact(paused ? "Turn on" : "Pause")}
    >{#if paused}<IconPlayLinear />{:else}<IconPauseLinear />{/if}<span
      >{paused ? "Turn on" : "Pause"}</span
    ></DropdownMenu.Item
  >
{/snippet}
{#snippet linkBar()}
  <BarItem
    icon={IconLinkLinear}
    label="Copy link"
    onclick={() => onact("Copy link")}
  />
{/snippet}
{#snippet linkMenu()}
  <DropdownMenu.Item onSelect={() => onact("Copy link")}
    ><IconLinkLinear /><span>Copy link</span></DropdownMenu.Item
  >
{/snippet}
{#snippet deleteBar()}
  <BarItem
    icon={IconTrashLinear}
    label="Delete routine"
    onclick={() => onact("Delete routine")}
  />
{/snippet}
{#snippet deleteMenu()}
  <DropdownMenu.Item
    onSelect={() => onact("Delete routine")}
    variant="destructive"
    ><IconTrashLinear /><span>Delete routine…</span></DropdownMenu.Item
  >
{/snippet}

{#snippet part(title: string)}
  <h3 class="m-0 type-label text-ink-muted">{title}</h3>
{/snippet}

<SideSurface
  {items}
  label="Routine"
  {onclose}
  recessed={false}
  title={routine.name}
>
  <div
    class="@container/routine flex min-h-0 flex-1 flex-col overflow-y-auto pt-(--side-room) scroll-timeline-transcript-head"
    data-routine-page={routine.id}
  >
    <div class="flex flex-col gap-space-6 px-space-5 pt-space-2 pb-space-6">
      <!-- Its head stands still: the state, the next run and who made it,
           over what each run does. -->
      <header class="flex flex-col gap-space-2">
        <div
          class="flex flex-wrap items-center gap-x-space-4 gap-y-space-1 type-meta text-ink-muted"
        >
          <span class="mark-line inline-flex items-center gap-space-2">
            <RoutineMark state={routine.state} words={routine.stateWords} />
            <span class="type-label text-ink-strong">{routine.stateWords}</span>
          </span>
          <span class="num">{nextWords}</span>
          <span>Made by {routine.madeBy}</span>
        </div>
        {#if !looks}
          <!-- What each run does; a routine that looks says what it looks
               for first thing below, in full. -->
          <p class="m-0 type-body text-ink-strong">{routine.sentence}</p>
        {/if}
        {#if routine.cawco}
          <p class="m-0 type-meta text-ink-muted">
            CawCo's own: what it does is fixed.
          </p>
        {/if}
      </header>

      <div
        class="grid grid-cols-1 gap-space-6 @routine-page/routine:grid-cols-3"
      >
        <!-- The wide column: why it needs you, what it looks for, its runs. -->
        <div
          class="flex min-w-0 flex-col gap-space-6 @routine-page/routine:col-span-2"
        >
          {#if routine.needs}
            <section
              aria-label="Needs you"
              class="flex items-start gap-space-3 rounded-md border border-border-hairline bg-surface-recess px-space-4 py-space-3"
            >
              <span class="flex h-lh items-center type-body"
                ><IconNeedsYou
                  class="size-icon-md text-status-attn-glyph"
                /></span
              >
              <div class="flex min-w-0 flex-col gap-space-3">
                <p class="m-0 type-body text-ink-strong">{routine.needs.why}</p>
                <div class="flex flex-wrap gap-space-2">
                  {#each routine.needs.choices as choice (choice.label)}
                    <Button
                      label={choice.label}
                      onclick={() => onact(choice.label)}
                      size="sm"
                      variant={choice.primary ? "outline" : "ghost"}
                    />
                  {/each}
                </div>
              </div>
            </section>
          {/if}

          {#if looks}
            <section
              aria-label="What it looks for"
              class="flex flex-col gap-space-4"
            >
              <div class="flex flex-col gap-space-1">
                {@render part("It is looking for")}
                <p class="m-0 type-body text-ink-strong">“{looks.statement}”</p>
              </div>
              <div class="flex flex-col gap-space-2">
                {@render part("How it finds out")}
                {#if looks.answer.kind === "command"}
                  <p class="m-0 type-body text-ink-muted">
                    A shell command runs, with no model. Its exit says the
                    answer.
                  </p>
                  <code
                    class="block rounded-sm border border-border-well bg-surface-well px-space-3 py-space-2 type-code text-ink-strong wrap-anywhere"
                    >{looks.answer.command}</code
                  >
                  <Collapsible.Root>
                    <Collapsible.Trigger class="group" look="fold">
                      <IconChevronRight
                        aria-hidden="true"
                        class="size-icon-sm flex-none group-state-open:rotate-90"
                      />
                      <span>How its exit is read</span>
                    </Collapsible.Trigger>
                    <Collapsible.Content reveal>
                      <ul
                        class="m-0 flex flex-col gap-space-1 ps-space-5 pt-space-2 type-body text-ink-muted"
                      >
                        <li>0: met</li>
                        <li>124, 126, 127 or a signal: could not check</li>
                        <li>Anything else: not yet</li>
                      </ul>
                    </Collapsible.Content>
                  </Collapsible.Root>
                {:else}
                  <p class="m-0 type-body text-ink-muted">
                    A model follows these instructions and judges:
                  </p>
                  <p class="m-0 type-body text-ink-strong line-clamp-3">
                    {looks.answer.instructions}
                  </p>
                {/if}
              </div>
              <div class="flex flex-col gap-space-2">
                {@render part("The latest look")}
                {#if latest}
                  <RunResult run={latest} />
                {:else}
                  <p class="m-0 type-body text-ink-muted">No answer yet.</p>
                {/if}
                <p class="m-0 type-meta num text-ink-muted">
                  {nextWords} · stops looking {looks.stops === "Until met"
                    ? "once met"
                    : `on ${looks.stops}`}
                </p>
              </div>
              <div class="flex flex-col gap-space-2">
                {@render part("What goes ahead when it is met")}
                {#if looks.holds.tasks.length === 0 && looks.holds.steps === 0}
                  <p class="m-0 type-body text-ink-muted">
                    No look will run: nothing waits on it.
                  </p>
                {:else}
                  <ul class="m-0 flex flex-col p-0 list-none">
                    {#each looks.holds.tasks as task (task)}
                      <li class="flex items-center gap-space-3 py-space-1">
                        <span
                          class="flex-auto min-w-0 type-body text-ink-strong"
                          >{task}</span
                        >
                        <OpenButton
                          kind="beside"
                          label="Open {task}"
                          onopen={() => onact(`Open ${task}`)}
                        />
                      </li>
                    {/each}
                    {#if looks.holds.steps > 0}
                      <li class="py-space-1 type-body text-ink-muted">
                        {looks.holds.steps} plan steps
                      </li>
                    {/if}
                  </ul>
                {/if}
              </div>
              {#if routine.state !== "finished" && !routine.needs}
                <div class="flex flex-wrap gap-space-2">
                  <Button
                    label="Say it is met"
                    onclick={() => onact("Say it is met")}
                    size="sm"
                    variant="outline"
                  />
                  <Button
                    label="Look again now"
                    onclick={() => onact("Look again now")}
                    size="sm"
                    variant="ghost"
                  />
                </div>
              {/if}
            </section>
          {:else}
            <section aria-label="Latest run" class="flex flex-col gap-space-2">
              {@render part("Latest run")}
              {#if latest}
                <RunResult run={latest} />
              {:else}
                <p class="m-0 type-body text-ink-muted">No run yet.</p>
              {/if}
            </section>
          {/if}

          {#if earlier.length > 0}
            <section
              aria-label={looks ? "Earlier looks" : "Earlier runs"}
              class="flex flex-col gap-space-1"
            >
              <h3
                class="flex items-center gap-space-2 m-0 type-label text-ink-muted"
              >
                <span>{looks ? "Earlier looks" : "Earlier runs"}</span>
                <Badge size="tally" variant="secondary"
                  ><span>{earlier.length}</span></Badge
                >
              </h3>
              <ul class="m-0 flex flex-col p-0 list-none">
                {#each earlier as run (run.id)}
                  {@const opened = runId === run.id}
                  <li class="flex flex-col gap-space-3 py-space-2">
                    <div class="flex items-start gap-space-3">
                      <span class="flex h-lh items-center type-label"
                        ><RunMark how={run.how} /></span
                      >
                      <div class="flex min-w-0 flex-auto flex-col gap-space-1">
                        <span class="type-meta num text-ink-muted"
                          >{RUN_WORDS[run.how]} · {run.when} · {run.started}</span
                        >
                        {#if !opened}
                          <span
                            class="type-body text-ink-strong line-clamp-1 wrap-anywhere"
                            >{run.words}</span
                          >
                        {/if}
                      </div>
                      <div
                        class="flex flex-none items-center gap-space-1 h-lh type-label"
                      >
                        <span class="grid size-6 place-items-center">
                          {#if run.sessionId}
                            <OpenButton
                              href={sessionHref(run.sessionId)}
                              kind="session"
                              label="Open the session that did this run"
                            />
                          {/if}
                        </span>
                        <OpenButton
                          kind="here"
                          label={opened
                            ? "Close this run's result"
                            : "Open this run's whole result"}
                          onopen={() => onrun(opened ? null : run.id)}
                          open={opened}
                        />
                      </div>
                    </div>
                    {#if opened}
                      <RunResult {run} />
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>

        <!-- The narrow column: when it runs, what it asked to do outside,
             and About. -->
        <div class="flex min-w-0 flex-col gap-space-6">
          <section aria-label="When it runs" class="flex flex-col gap-space-2">
            {@render part("When it runs")}
            <dl class="m-0 flex flex-col gap-space-3">
              <div class="flex flex-col gap-space-1">
                <dt class="type-meta text-ink-muted">Rhythm</dt>
                <dd class="m-0 type-body text-ink-strong">{routine.rhythm}</dd>
              </div>
              <div class="flex flex-col gap-space-1">
                <dt class="type-meta text-ink-muted">Also starts when</dt>
                <dd class="m-0 type-body text-ink-strong">
                  {routine.starts ?? "Nothing else starts it"}
                </dd>
              </div>
              {#if routine.upcoming.length > 0}
                <div class="flex flex-col gap-space-1">
                  <dt class="type-meta text-ink-muted">Coming runs</dt>
                  <dd class="m-0">
                    <ol
                      class="m-0 flex flex-col gap-space-1 p-0 list-none type-body num text-ink-strong"
                    >
                      {#each routine.upcoming as at (at)}
                        <li>{at}</li>
                      {/each}
                    </ol>
                  </dd>
                </div>
              {/if}
            </dl>
          </section>

          {#if actions.length > 0}
            <section
              aria-label="Asked to do outside"
              class="flex flex-col gap-space-2"
            >
              {@render part("Asked to do outside")}
              <ul class="m-0 flex flex-col gap-space-2 p-0 list-none">
                {#each actions as action (action.id)}
                  <li class="flex flex-col gap-space-1">
                    <span class="type-body text-ink-strong">{action.what}</span>
                    <span class="type-meta num text-ink-muted"
                      >{action.service} · {action.at}</span
                    >
                    {#if action.said}
                      <span class="type-body text-status-fail-ink"
                        >Answered: {action.said}</span
                      >
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <Collapsible.Root>
            <section
              aria-label="About this routine"
              class="flex flex-col gap-space-2"
            >
              <Collapsible.Trigger class="group" look="fold">
                <IconChevronRight
                  aria-hidden="true"
                  class="size-icon-sm flex-none group-state-open:rotate-90"
                />
                <span>About this routine</span>
              </Collapsible.Trigger>
              <Collapsible.Content reveal>
                <dl class="m-0 flex flex-col gap-space-3 pt-space-2">
                  <div class="flex flex-col gap-space-1">
                    <dt class="type-meta text-ink-muted">Each run is told</dt>
                    <dd class="m-0 type-body text-ink-strong">
                      {routine.instruction}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-space-1">
                    <dt class="type-meta text-ink-muted">Who does each run</dt>
                    <dd class="m-0 type-body text-ink-strong">
                      {routine.doer}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-space-1">
                    <dt class="type-meta text-ink-muted">Made by</dt>
                    <dd class="m-0 type-body text-ink-strong">
                      {routine.madeBy}{routine.why ? `: “${routine.why}”` : ""}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-space-1">
                    <dt class="type-meta text-ink-muted">Spend</dt>
                    <dd class="m-0 type-body num text-ink-strong">
                      {routine.limits}
                    </dd>
                  </div>
                </dl>
              </Collapsible.Content>
            </section>
          </Collapsible.Root>
        </div>
      </div>
    </div>
  </div>
</SideSurface>
