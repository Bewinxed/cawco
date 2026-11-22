<script lang="ts">
  /**
   * The cockpit project's Routines view as the project page draws it, for
   * its live stories: the project's head and its strip of views (the
   * phone's views bar under 900px), the view in the page's pane inset, and
   * the routine he opens beside it in the page's split (its own page under
   * 900px). Its state is the mock hub's: the routines, his acts on the ones
   * that need him, and which stands open. Sending an answer or turning a
   * routine back on waits, then the hub's answer (`hub`) lands.
   */
  import { routineOutcomeWords as words } from "@cawco/core/words/routine-outcomes";
  import { MediaQuery } from "svelte/reactivity";
  import { COCKPIT, cockpitLead } from "#lib/cawco/project/fixtures/cockpit.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { DRAWER_QUERY, NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    type ActState,
    type GroupProps,
    keepOrder,
    type RoutineItem,
  } from "./outcomes";
  import RoutineSide from "./RoutineSide.svelte";
  import RoutinesLead from "./RoutinesLead.svelte";
  import RoutinesTiles from "./RoutinesTiles.svelte";
  import { NOW, ROUTINES } from "./routines.fixture";

  let {
    direction,
    hub = "takes",
  }: {
    direction: "tiles" | "lead";
    /** What the hub answers an answer or a turn-on: it takes it, or refuses it in its sentence. */
    hub?: "takes" | "refuses";
  } = $props();

  const project = COCKPIT;
  const lead = cockpitLead();
  const views = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 2 },
  ];

  const wideQuery = new MediaQuery(NARROW_QUERY);
  const splitQuery = new MediaQuery(DRAWER_QUERY);
  const wide = $derived(!wideQuery.current);
  const sheet = $derived(splitQuery.current);

  /** The mock hub: the routines as it reads them, his acts, what stands open. */
  let items = $state<RoutineItem[]>(structuredClone(ROUTINES));
  let acts = $state<Record<string, ActState>>({});
  let opened = $state<string | null>(null);
  const openItem = $derived(items.find((item) => item.id === opened) ?? null);

  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const timeOf = (ms: number): string => clock.format(ms);
  /** Tonight's 03:00 slot, from the fixture's Sunday morning. */
  const TONIGHT = Date.UTC(2026, 10, 23, 3, 0);

  function land(id: string, change: (item: RoutineItem) => void, said: string) {
    acts = { ...acts, [id]: { kind: "pending" } };
    setTimeout(() => {
      if (hub === "refuses") {
        acts = {
          ...acts,
          [id]: {
            kind: "refused",
            said: "The hub didn't take it: nixbox, where cockpit runs, isn't answering. Try again once it is back.",
          },
        };
        return;
      }
      items = items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const next = structuredClone($state.snapshot(item));
        change(next);
        return next;
      });
      acts = { ...acts, [id]: { kind: "done", said } };
    }, 900);
  }

  function onanswer(id: string, _answer: string) {
    land(
      id,
      (item) => {
        item.routine.needs = null;
        item.routine.enabled = true;
        item.routine.disabledReason = null;
        item.routine.schedule.nextAt = TONIGHT;
      },
      words.ask.answered(`tonight at ${timeOf(TONIGHT)}`)
    );
  }

  function onturnon(id: string) {
    land(
      id,
      (item) => {
        item.routine.needs = null;
        item.routine.enabled = true;
        item.routine.disabledReason = null;
        const last = item.routine.lastRun;
        if (last) {
          item.routine.lastRun = {
            ...last,
            state: "running",
            startedAt: NOW,
            endedAt: null,
            outcome: null,
            reason: null,
          };
        }
      },
      words.off.on("now, and after each merge to main")
    );
  }

  function onopen(id: string) {
    opened = opened === id ? null : id;
  }

  /** The outcomes where he first saw them, and what each group takes. */
  const order = keepOrder();
  const outcomes = $derived(order(items));
  const group = $derived<GroupProps>({
    opened,
    acts,
    timeOf,
    onopen,
    onanswer,
    onturnon,
  });
</script>

<div
  data-slot="project-page"
  class="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-page"
>
  {#if sheet && openItem}
    <!-- Under 900px a routine is its own page, as a task is. -->
    <div class="flex min-h-0 flex-1 flex-col p-space-3">
      <RoutineSide
        item={openItem}
        onclose={() => {
          opened = null;
        }}
        placement="sheet"
        {timeOf}
      />
    </div>
  {:else}
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto max-phone:pb-space-8"
    >
      <ProjectHead
        {lead}
        machine={null}
        onask={null}
        onfilter={() => undefined}
        onnewtask={() => undefined}
        {project}
        seated
        setup={null}
      />
      <div class="contents max-phone:hidden">
        <div
          data-slot="strip"
          class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
        >
          <ViewTabs
            current="routines"
            hrefOf={(view) => `?view=${view}`}
            onchoose={() => undefined}
            {views}
          />
        </div>
      </div>
      {#if sheet}
        {@render pane()}
      {:else}
        <Split
          backLabel="Back to Routines"
          defaultWidth={36}
          keys={{
            width: "cawco.routines-view.width",
            expanded: "cawco.routines-view.expanded",
          }}
          main={pane}
          open={openItem !== null}
          side={beside}
        />
      {/if}
    </div>
    {#if !wide}
      <ViewBar
        current="routines"
        needs={0}
        needsOn={false}
        onchoose={() => undefined}
        onnewsession={() => undefined}
        ontoggleneeds={() => undefined}
        {views}
      />
    {/if}
  {/if}
</div>

{#snippet pane()}
  <div data-slot="pane" class={["w-full min-w-0 pb-space-5", PANE_INSET]}>
    {#if direction === "tiles"}
      <RoutinesTiles {group} {outcomes} />
    {:else}
      <RoutinesLead {group} {outcomes} />
    {/if}
  </div>
{/snippet}

{#snippet beside()}
  {#if openItem}
    <RoutineSide
      item={openItem}
      onclose={() => {
        opened = null;
      }}
      {timeOf}
    />
  {/if}
{/snippet}
