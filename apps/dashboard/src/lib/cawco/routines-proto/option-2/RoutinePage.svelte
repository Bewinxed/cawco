<script lang="ts">
  /**
   * A routine, opened beside the view (the shared page of both options),
   * as far as this first frame needs it: its bar (Edit and Change with Caw
   * standing visible, Run now or Pause, More, and the one prominent act its
   * state calls for), its head, why it needs the person while it does, what
   * it looks for, when it runs, and its runs as a list whose rows open each
   * run in this same place.
   */
  import { DAY_MS, MINUTE_MS } from "@cawco/core/time";
  import { HEAD_PRIORITY, type HeadItem } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChat,
    IconChatLinear,
    IconMaximize,
    IconPauseLinear,
    IconPenLinear,
    IconPlayLinear,
  } from "#lib/icons.js";
  import {
    clockOf,
    ENDING_WORD,
    NOW,
    nearTime,
    type Routine,
    type Run,
  } from "./day";
  import RunGlyph from "./RunGlyph.svelte";

  let {
    routine,
    runs,
    now = NOW,
    onopenrun,
    onchoose,
    onedit,
    onchangewithcaw,
    onclose,
  }: {
    routine: Routine;
    /** Its runs, any order. */
    runs: Run[];
    now?: number;
    onopenrun: (id: string) => void;
    onchoose: (id: string, choice: string) => void;
    onedit: (id: string) => void;
    onchangewithcaw: (id: string) => void;
    onclose: () => void;
  } = $props();

  const own = $derived(
    runs
      .filter((run) => run.routineId === routine.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
  );
  const count = $derived(
    runs.filter((run) => run.routineId === routine.id).length
  );
  const cawcoOwn = $derived(routine.madeBy === "CawCo");
  const prominentAct = $derived(routine.needs?.prominent ?? "Run now");

  const stateWords = $derived.by(() => {
    const s = routine.state;
    switch (s.kind) {
      case "on":
        return "On";
      case "paused":
        return `Paused by ${s.by} on ${s.on}`;
      case "finished":
        return `Finished: ${s.how}`;
      case "stopped":
        return `Stopped: ${s.why}`;
      case "turnsOff":
        return `Turns itself off in ${s.inDays} days`;
      default:
        return "";
    }
  });

  const items = $derived<HeadItem[]>([
    { key: "edit", priority: HEAD_PRIORITY.mode, bar: editBar, menu: editMenu },
    {
      key: "caw",
      priority: HEAD_PRIORITY.mode,
      bar: cawBar,
      menu: cawMenu,
    },
    {
      key: "pause",
      priority: HEAD_PRIORITY.reload,
      bar: pauseBar,
      menu: pauseMenu,
    },
    {
      key: "link",
      priority: HEAD_PRIORITY.open,
      bar: linkMenu,
      menu: linkMenu,
      place: "more",
    },
    {
      key: "act",
      priority: HEAD_PRIORITY.control,
      bar: actBar,
      menu: actMenu,
      place: "prominent",
    },
  ]);

  /** How far apart its clock times stand: every 15 minutes, every day, or every week. */
  function stepOf(one: Routine): number {
    if (one.id === "npm") {
      return 15 * MINUTE_MS;
    }
    return one.rhythm.startsWith("Every day") ? DAY_MS : 7 * DAY_MS;
  }

  /** The next five clock times, for a routine started by the clock. */
  const nextFive = $derived.by(() => {
    if (routine.next === null) {
      return [];
    }
    const step = stepOf(routine);
    return Array.from({ length: 5 }, (_, n) => (routine.next ?? 0) + n * step);
  });
</script>

{#snippet editBar()}
  <BarItem
    icon={IconPenLinear}
    label="Edit"
    onclick={() => onedit(routine.id)}
  />
{/snippet}
{#snippet editMenu()}
  <DropdownMenu.Item onSelect={() => onedit(routine.id)}>
    <IconPenLinear /><span>Edit</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet cawBar()}
  <BarItem
    icon={IconChatLinear}
    label="Change with Caw"
    onclick={() => onchangewithcaw(routine.id)}
  />
{/snippet}
{#snippet cawMenu()}
  <DropdownMenu.Item onSelect={() => onchangewithcaw(routine.id)}>
    <IconChat /><span>Change with Caw</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet pauseBar()}
  {#if routine.state.kind === "paused"}
    <BarItem
      icon={IconPlayLinear}
      label="Turn on"
      onclick={() => onchoose(routine.id, "Turn on")}
    />
  {:else}
    <BarItem
      icon={IconPauseLinear}
      label="Pause"
      onclick={() => onchoose(routine.id, "Pause")}
    />
  {/if}
{/snippet}
{#snippet pauseMenu()}
  <DropdownMenu.Item onSelect={() => onchoose(routine.id, "Pause")}>
    <IconPauseLinear /><span>Pause</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet linkMenu()}
  <DropdownMenu.Item onSelect={() => onchoose(routine.id, "Copy link")}>
    <span>Copy link</span>
  </DropdownMenu.Item>
  <DropdownMenu.Item
    onSelect={() => onchoose(routine.id, "Delete routine")}
    variant="destructive"
  >
    <span>Delete routine</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet actBar()}
  <Button
    onclick={() => onchoose(routine.id, prominentAct)}
    shape="capsule"
    size="sm">{prominentAct}</Button
  >
{/snippet}
{#snippet actMenu()}
  <DropdownMenu.Item onSelect={() => onchoose(routine.id, prominentAct)}>
    <span>{prominentAct}</span>
  </DropdownMenu.Item>
{/snippet}

<SideSurface
  {items}
  label="Routine {routine.name}"
  {onclose}
  recessed={false}
  title={routine.name}
>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
  >
    <article
      data-slot="routine-page"
      class="flex flex-col gap-space-6 px-space-6 pt-space-3 pb-space-8"
    >
      <header class="flex flex-col gap-space-2">
        <p class="m-0 type-meta text-ink-muted">
          {stateWords}{routine.next === null
            ? ""
            : ` · next ${nearTime(routine.next, now)}`} · made by {routine.madeBy}
        </p>
        {#if !routine.looksFor}
          <p class="m-0 type-body text-ink-strong">{routine.does}</p>
        {/if}
        {#if cawcoOwn}
          <p class="m-0 type-meta text-ink-muted">
            CawCo's own: what it does is fixed; only its time can change.
          </p>
        {/if}
      </header>

      {#if routine.needs}
        <section
          aria-label="Needs you"
          class="flex flex-col gap-space-2 border-s-2 border-status-attn-glyph ps-space-4"
        >
          <h3 class="m-0 type-label font-medium text-status-attn-ink">
            Needs you
          </h3>
          <p class="m-0 type-body text-ink-strong">{routine.needs.why}</p>
        </section>
      {/if}

      {#if routine.looksFor}
        <section
          aria-label="What it looks for"
          class="flex flex-col gap-space-2"
        >
          <h3 class="m-0 type-label font-medium text-ink-muted">
            It is looking for
          </h3>
          <p class="m-0 type-body text-ink-strong">
            {routine.looksFor.statement}
          </p>
          <p class="m-0 type-meta text-ink-muted">How it finds out</p>
          <p
            class={[
              "m-0 text-ink-row",
              routine.doer.startsWith("A shell command")
                ? "w-fit rounded-sm bg-surface-recess px-space-2 py-space-1 type-code"
                : "type-body",
            ]}
          >
            {routine.looksFor.how}
          </p>
          <p class="m-0 type-meta text-ink-muted">
            What goes ahead when it is met
          </p>
          <p class="m-0 type-body text-ink-row">
            {routine.looksFor.holds.length > 0
              ? routine.looksFor.holds.join(" · ")
              : "No look will run: nothing waits on it."}
          </p>
        </section>
      {/if}

      <section aria-label="When it runs" class="flex flex-col gap-space-2">
        <h3 class="m-0 type-label font-medium text-ink-muted">When it runs</h3>
        <p class="m-0 type-body text-ink-strong">{routine.rhythm}</p>
        {#if routine.wontRun}
          <p class="m-0 type-body text-ink-row">{routine.wontRun}</p>
        {/if}
        {#if nextFive.length > 0}
          <p class="m-0 num type-meta text-ink-muted">
            {nextFive.map((t) => nearTime(t, now)).join(" · ")}
          </p>
        {/if}
      </section>

      <section aria-label="Runs" class="flex flex-col gap-space-1">
        <h3 class="m-0 type-label font-medium text-ink-muted">
          Runs <span class="num">{count}</span>
        </h3>
        {#if own.length === 0}
          <p class="m-0 type-body text-ink-row">
            No run yet{routine.next === null
              ? ""
              : `: next ${nearTime(routine.next, now)}`}.
          </p>
        {/if}
        <ol class="m-0 flex list-none flex-col p-0">
          {#each own as run (run.id)}
            <li
              class="mark-line grid grid-cols-(--runs-cols) items-center gap-x-space-3 py-space-1"
              style:--runs-cols={"calc(9 * var(--spacing-space-2)) var(--spacing-icon-md) minmax(0, 1fr) auto"}
            >
              <span class="num type-meta text-ink-muted"
                >{nearTime(run.at, now)}</span
              >
              <RunGlyph mark={run.ending} size="sm" />
              <span
                class="overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-row"
                ><span class="text-ink-strong">{ENDING_WORD[run.ending]}</span>
                · {run.words}</span
              >
              <Tip label="Open run">
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label="Open the run at {clockOf(run.at)}"
                    onclick={() => onopenrun(run.id)}
                    press="scale"
                    size="icon-xs"
                    tone="quiet"
                    variant="ghost"
                  >
                    <IconMaximize aria-hidden="true" />
                  </Button>
                {/snippet}
              </Tip>
            </li>
          {/each}
        </ol>
      </section>
    </article>
  </div>
</SideSurface>
