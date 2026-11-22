<script lang="ts">
  /**
   * The Routines page of a project as a shape to judge: the project's head
   * and its view tabs, and every routine once, as a quiet card
   * (RoutineCard). `arrangement` is what the shapes differ in:
   *
   * - `grid`: one tray of cards in the order the person keeps them (by
   *   name), filling the width as the board does; what needs the person
   *   is marked where it stands.
   * - `when`: the board's columns, one per stretch of time a routine runs
   *   next in (now and the next hour, later today, later, when something
   *   happens, not running); each routine in the one column its next run
   *   puts it in.
   *
   * A card's open button opens the routine beside the page (RoutineOpen),
   * the page itself on a phone. A card's one act answers its ask in place:
   * Run again starts a run, Keep keeps it; Review and Keep looking open
   * it at its choices. The routines are the shape's mock (shape-data).
   */
  import { MediaQuery } from "svelte/reactivity";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { NARROW_QUERY, PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconPlus } from "#lib/icons.js";
  import RoutineCard from "./RoutineCard.svelte";
  import RoutineOpen from "./RoutineOpen.svelte";
  import {
    LANES,
    MOCK_MACHINE,
    MOCK_PROJECT,
    PROJECT_VIEWS,
    ROUTINES,
    type ShapeRoutine,
  } from "./shape-data";

  let {
    arrangement,
  }: {
    /** How the page lays the routines out: one tray, or a column per when. */
    arrangement: "grid" | "when";
  } = $props();

  const narrow = new MediaQuery(NARROW_QUERY);
  const phoneQuery = new MediaQuery(PHONE_QUERY);
  const phone = $derived(narrow.current);

  /** What the mock hub holds: the routines as the person's presses left them. */
  let routines = $state<ShapeRoutine[]>(structuredClone(ROUTINES));
  let openId = $state<string | null>(null);
  const opened = $derived(routines.find((one) => one.id === openId) ?? null);

  const lead = new CawLead({
    id: () => MOCK_PROJECT.id,
    machinesOnline: () => true,
    project: () => MOCK_PROJECT,
    reading: () => false,
    tasks: () => [],
  });

  function change(id: string, to: (one: ShapeRoutine) => ShapeRoutine): void {
    routines = routines.map((one) => (one.id === id ? to(one) : one));
  }

  function runNow(id: string): void {
    change(id, (one) => ({
      ...one,
      ask: null,
      running: true,
      sentence: "Running now: started by you.",
      ago: null,
      lane: "soon",
      next: "Running now",
    }));
  }

  function keep(id: string): void {
    change(id, (one) => ({
      ...one,
      ask: null,
      sentence: "Kept by you: it no longer turns itself off.",
      ago: "just now",
    }));
  }

  function pause(id: string): void {
    change(id, (one) =>
      one.paused
        ? {
            ...one,
            paused: false,
            off: false,
            sentence: "Resumed by you.",
            ago: "just now",
            held: null,
          }
        : {
            ...one,
            paused: true,
            off: true,
            sentence: "Paused by you just now.",
            ago: null,
            held: "Paused by you: nothing runs until you resume it.",
          }
    );
  }

  function act(id: string): void {
    const routine = routines.find((one) => one.id === id);
    if (routine?.ask?.does === "run") {
      runNow(id);
    } else if (routine?.ask?.does === "keep") {
      keep(id);
    } else {
      openId = id;
    }
  }

  /** As many board-wide cards across as the width holds. */
  const CARDS =
    "repeat(auto-fill, minmax(min(100%, var(--spacing-c-board-col-min)), 1fr))";

  /** A column's name, read out with how many routines it holds. */
  const laneLabel = (label: string, count: number): string =>
    `${label}, ${count} ${count === 1 ? "routine" : "routines"}`;

  function noop(): void {
    // The shape's head, tabs and Ask lead nowhere: they are the page's frame.
  }
</script>

{#snippet card(routine: ShapeRoutine)}
  <li class="min-w-0">
    <RoutineCard
      onact={act}
      onopen={(id) => {
        openId = id;
      }}
      {routine}
      selected={openId === routine.id}
    />
  </li>
{/snippet}

{#snippet grid()}
  <ol
    aria-label="Routines"
    class="m-0 grid list-none grid-cols-(--cards) gap-space-1 rounded-lg bg-surface-recess p-space-1 inset-ring inset-ring-border-hairline"
    style:--cards={CARDS}
  >
    {#each routines as routine (routine.id)}
      {@render card(routine)}
    {/each}
  </ol>
{/snippet}

{#snippet lanes()}
  <div
    class="grid grid-flow-col auto-cols-(--cols) gap-space-3 overflow-x-auto pb-space-3 max-phone:grid-flow-row max-phone:auto-cols-auto"
    style:--cols="minmax(var(--spacing-c-board-col-min), 1fr)"
  >
    {#each LANES as lane (lane.lane)}
      {@const inLane = routines.filter((one) => one.lane === lane.lane)}
      <section
        aria-label={laneLabel(lane.label, inLane.length)}
        class="flex min-w-0 flex-col gap-space-1 self-start rounded-lg bg-surface-recess p-space-1 inset-ring inset-ring-border-hairline"
      >
        <header class="flex flex-col px-space-2 py-space-1">
          <span
            class="mark-line flex min-h-c-btn-h-xs items-center gap-space-2"
          >
            <h3
              class="m-0 min-w-0 overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong"
            >
              {lane.label}
            </h3>
            {#if inLane.length > 0}
              <span class="num ms-auto type-meta text-ink-subtle"
                >{inLane.length}</span
              >
            {/if}
          </span>
          <span class="type-meta text-ink-subtle">{lane.line}</span>
        </header>
        <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each inLane as routine (routine.id)}
            {@render card(routine)}
          {/each}
        </ol>
      </section>
    {/each}
  </div>
{/snippet}

{#snippet newRoutine()}
  <Button icon={IconPlus} label="New routine" size="sm" />
{/snippet}

{#snippet main()}
  <main
    class={[
      "flex min-h-0 flex-1 flex-col overflow-y-auto pt-0 pb-space-5 max-phone:overflow-visible",
      PANE_INSET,
    ]}
  >
    <div class="flex flex-col gap-space-3">
      {#if phoneQuery.current}
        <div class="flex justify-end">{@render newRoutine()}</div>
      {/if}
      {#if arrangement === "grid"}
        {@render grid()}
      {:else}
        {@render lanes()}
      {/if}
    </div>
  </main>
{/snippet}

{#snippet side()}
  {#if opened}
    <RoutineOpen
      onchange={noop}
      onedit={noop}
      onclose={() => {
        openId = null;
      }}
      onkeep={keep}
      onpause={pause}
      onrun={runNow}
      {phone}
      routine={opened}
    />
  {/if}
{/snippet}

<div
  class="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
>
  {#if phone && opened}
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {@render side()}
    </div>
  {:else}
    <div
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:overflow-y-auto max-phone:pb-space-8"
    >
      <ProjectHead
        {lead}
        machine={MOCK_MACHINE}
        onask={noop}
        onfilter={noop}
        onnewtask={null}
        project={MOCK_PROJECT}
        seated
        setup={null}
      />
      {#if !phoneQuery.current}
        <nav
          aria-label="Project sections"
          class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
        >
          <ViewTabs
            current="routines"
            hrefOf={(view) => `#${view}`}
            onchoose={noop}
            views={PROJECT_VIEWS}
          />
          <div class="ms-auto">{@render newRoutine()}</div>
        </nav>
      {/if}
      {#if phone}
        {@render main()}
      {:else}
        <Split
          backLabel="Back to routines"
          defaultWidth={42}
          keys={{
            expanded: "cawco.routines.shape.expanded",
            width: "cawco.routines.shape.width",
          }}
          {main}
          open={opened !== null}
          {side}
        />
      {/if}
    </div>
    {#if phoneQuery.current}
      <ViewBar
        current="routines"
        needs={0}
        needsOn={false}
        onchoose={noop}
        onnewsession={noop}
        ontoggleneeds={noop}
        views={PROJECT_VIEWS}
      />
    {/if}
  {/if}
</div>
