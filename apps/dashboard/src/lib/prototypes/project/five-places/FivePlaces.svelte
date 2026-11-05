<script lang="ts">
  import { unhandled } from "@cawco/core/unhandled";
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * A project in five places, the board its front door: the whole screen at
   * any width, its state as props and its records as a fixture (records.ts).
   *
   * - The bar (Liquid Glass): the project's name; one glass group of bare
   *   symbols (Search on Tasks, More); the place's one prominent action.
   * - The row of five under the bar on a desk, the bottom bar on a phone.
   * - The needs-you line under the row on every place.
   * - The place: Tasks, Routines, Decisions or Outputs.
   * - Caw's pane: docked beside the page at 1024 and up, an overlay drawer
   *   from the right under it, a full screen on a phone.
   * - The task pane over the list, and the two sheets under More.
   *
   * Every width-dependent arrangement is the screen's own container query
   * (`@container/five`), so a frame of any width draws the form its own
   * width would. A press moves the live instance between places; a story's
   * args set where it starts.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAdd,
    IconCheck,
    IconDollar,
    IconMore,
    IconSearch,
    IconSettings,
    IconSidebar,
  } from "#lib/icons.js";
  import CawPane from "./CawPane.svelte";
  import DecisionsPlace from "./DecisionsPlace.svelte";
  import { type Filter, filterCounts, type Read, type View } from "./derive";
  import MoreSheet from "./MoreSheet.svelte";
  import { paneSlide } from "./motion";
  import NeedsLine, { type NeedsTarget } from "./NeedsLine.svelte";
  import OutputsPlace from "./OutputsPlace.svelte";
  import PlacesRow from "./PlacesRow.svelte";
  import RoutinesPlace from "./RoutinesPlace.svelte";
  import type { Decision, OutputKind, Place, ProjectRecords } from "./records";
  import ShellRail from "./ShellRail.svelte";
  import StandInPane from "./StandInPane.svelte";
  import TasksPlace from "./TasksPlace.svelte";

  let {
    records,
    read = "live",
    unread = [],
    unreadStages = [],
    sessionsStale = false,
    place: placeArg = "tasks",
    caw: cawArg = false,
    task: taskArg = null,
    decision: decisionArg = null,
    output: outputArg = null,
    routine = null,
    sheet: sheetArg = null,
    asking = null,
    filter: filterArg,
    view = "board",
    stage,
    group = "waits",
    kind = "all",
    grouping = "task",
    refusal,
    cawDraft = "",
    spinning = false,
    height = 920,
  }: {
    records: ProjectRecords;
    read?: Read;
    /** Places whose read failed: no mark on the row, and their page says why. */
    unread?: Place[];
    unreadStages?: string[];
    sessionsStale?: boolean;
    place?: Exclude<Place, "caw">;
    /** Caw's pane is open. */
    caw?: boolean;
    /** The task whose pane is open (the link carries it). */
    task?: string | null;
    decision?: string | null;
    output?: string | null;
    routine?: string | null;
    sheet?: "spend" | "configure" | null;
    asking?: "forget" | "delete" | null;
    /** The saved filter in the link; unset, Needs you while it counts, else All. */
    filter?: Filter;
    view?: View;
    stage?: string;
    group?: Decision["group"];
    kind?: OutputKind | "all";
    grouping?: "task" | "newest";
    refusal?: string;
    cawDraft?: string;
    spinning?: boolean;
    /** The screen's height, px: the frame it is drawn in. */
    height?: number;
  } = $props();

  // Each follows its arg; a press moves it until the arg changes.
  let place = $derived(placeArg);
  let caw = $derived(cawArg);
  let task = $derived(taskArg);
  let decision = $derived(decisionArg);
  let output = $derived(outputArg);
  let sheet = $derived(sheetArg);
  let filterPicked = $derived(filterArg);
  let draft = $derived(cawDraft);

  const counts = $derived(filterCounts(records));
  const filter = $derived<Filter>(
    filterPicked ?? (read === "live" && counts.needs > 0 ? "needs" : "all")
  );

  let screen = $state<HTMLElement>();

  const go = (to: Place) => {
    if (to === "caw") {
      caw = !caw;
      return;
    }
    place = to;
    task = null;
    decision = null;
    output = null;
  };

  const follow = (target: NeedsTarget) => {
    switch (target) {
      case "tasks":
        place = "tasks";
        filterPicked = "needs";
        break;
      case "decisions":
        place = "decisions";
        break;
      case "routines":
        place = "routines";
        break;
      case "session":
        caw = true;
        break;
      case "spend":
        sheet = "spend";
        break;
      default:
        unhandled("needs target", target);
    }
  };

  const askCaw = (said: string) => {
    draft = said;
    caw = true;
  };

  const addTask = () => {
    place = "tasks";
    screen
      ?.querySelector<HTMLInputElement>(
        `input[aria-label="${words.composerLabel}"]`
      )
      ?.focus();
  };

  const openTask = $derived(records.tasks.find((one) => one.id === task));
  const openDecision = $derived(
    records.decisions.find((one) => one.id === decision)
  );
  const openOutput = $derived(records.outputs.find((one) => one.id === output));
  const stageName = (id: string) =>
    records.stages.find((one) => one.id === id)?.name ?? id;

  const ACTIONS: Partial<Record<Place, { label: string; run: () => void }>> = {
    tasks: { label: words.addTask, run: () => addTask() },
    routines: {
      label: words.newRoutine,
      run: () => askCaw(words.askCawRoutine),
    },
  };
  const action = $derived(ACTIONS[place]);
</script>

<Tooltip.Provider>
  <div
    bind:this={screen}
    class="@container/five relative flex w-full overflow-hidden bg-surface-page text-ink-strong contain-layout h-(--frame-h)"
    data-five
    style:--frame-h={`${height}px`}
  >
    <div class="hidden h-full @wide/five:flex">
      <ShellRail project={records.name} />
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <div class="relative flex min-h-0 flex-1 flex-col">
        <!-- The bar: one row, no ground of its own. -->
        <header
          class="flex flex-none h-c-top-bar-h items-center gap-space-2 ps-space-3 pe-space-4 @wide/five:ps-space-7"
        >
          <span class="@wide/five:hidden">
            <Tip label={words.openMenu}>
              {#snippet children(tip)}
                <Button
                  {...tip}
                  aria-label={words.openMenu}
                  icon={IconSidebar}
                  size="icon-sm"
                  variant="ghost"
                />
              {/snippet}
            </Tip>
          </span>
          <h1
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
          >
            {records.name}
          </h1>
          <div class="ms-auto flex items-center gap-space-2">
            <div
              class="flex items-center gap-space-1 rounded-pill border border-border-hairline bg-material-panel p-c-bar-group-pad shadow-tile glass-backdrop"
            >
              {#if place === "tasks"}
                <Tip label={words.search}>
                  {#snippet children(tip)}
                    <Button
                      {...tip}
                      aria-label={words.search}
                      icon={IconSearch}
                      onclick={() =>
                        screen
                          ?.querySelector<HTMLInputElement>(
                            "[data-task-search]"
                          )
                          ?.focus()}
                      size="icon-sm"
                      variant="ghost"
                    />
                  {/snippet}
                </Tip>
              {/if}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      aria-label={words.more}
                      icon={IconMore}
                      size="icon-sm"
                      title={words.more}
                      variant="ghost"
                    />
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  align="end"
                  portalProps={{ disabled: true }}
                  width="regular"
                >
                  {#if place === "tasks"}
                    <DropdownMenu.Item
                      ><IconCheck aria-hidden="true" /><span
                        >{words.select}</span
                      ></DropdownMenu.Item
                    >
                    <DropdownMenu.Separator />
                  {/if}
                  <DropdownMenu.Item
                    onSelect={() => {
                      sheet = "spend";
                    }}
                    ><IconDollar aria-hidden="true" /><span>{words.spend}</span
                    ></DropdownMenu.Item
                  >
                  <DropdownMenu.Item
                    onSelect={() => {
                      sheet = "configure";
                    }}
                    ><IconSettings aria-hidden="true" /><span
                      >{words.configure}</span
                    ></DropdownMenu.Item
                  >
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
            {#if action}
              <Button
                icon={IconAdd}
                label={action.label}
                onclick={action.run}
                size="sm"
              />
            {/if}
          </div>
        </header>

        <div class="flex min-h-0 flex-1">
          <main
            class="relative flex min-h-0 min-w-0 flex-1 flex-col gap-space-4 overflow-hidden ps-space-4 pe-space-4 pt-space-2 pb-space-4 @phone/five:ps-space-7 @phone/five:pe-space-6"
          >
            <div class="hidden @phone/five:block">
              <PlacesRow
                {caw}
                form="row"
                onplace={go}
                {place}
                {read}
                {records}
                {unread}
              />
            </div>
            <NeedsLine onfollow={follow} {read} {records} />
            {#if unread.includes(place)}
              <p class="type-meta text-ink-muted" role="status">
                {words.partial(words.places[place])}
              </p>
            {/if}

            {#if place === "tasks"}
              <TasksPlace
                {filter}
                onaskcaw={askCaw}
                onfilter={(next) => {
                  filterPicked = next;
                }}
                onopen={(id) => {
                  task = id;
                }}
                opened={task}
                {read}
                {records}
                {refusal}
                {stage}
                {unreadStages}
                {view}
              />
            {:else if place === "routines"}
              <RoutinesPlace onaskcaw={askCaw} {read} {records} {routine} />
            {:else if place === "decisions"}
              <DecisionsPlace
                {group}
                onaskcaw={askCaw}
                onopen={(id) => {
                  decision = id;
                }}
                opened={decision}
                {read}
                {records}
              />
            {:else}
              <OutputsPlace
                {grouping}
                {kind}
                onaskcaw={askCaw}
                onopenitem={(id) => {
                  output = id;
                }}
                onopentask={(id) => {
                  task = id;
                }}
                {read}
                {records}
              />
            {/if}

            {#if openTask}
              <StandInPane
                id={openTask.id}
                line={words.taskStandIn}
                onclose={() => {
                  task = null;
                }}
                stage={stageName(openTask.stage)}
                title={openTask.title}
              />
            {:else if task}
              <StandInPane
                id={task}
                line={words.taskStandIn}
                onclose={() => {
                  task = null;
                }}
                title={records.outputs.find((one) => one.task === task)
                  ?.taskTitle ?? task}
              />
            {:else if openDecision}
              <StandInPane
                id={words.places.decisions}
                line={words.decisionStandIn}
                onclose={() => {
                  decision = null;
                }}
                title={openDecision.title}
              />
            {:else if openOutput}
              <StandInPane
                id={words.outputsKinds[openOutput.kind]}
                line={words.outputStandIn}
                onclose={() => {
                  output = null;
                }}
                title={openOutput.title}
              />
            {/if}
          </main>

          {#if caw}
            <aside
              aria-label={words.places.caw}
              class="absolute inset-0 z-3 flex flex-col overflow-hidden @phone/five:start-auto @phone/five:w-c-panel-w @phone/five:max-w-full @phone/five:@max-wide/five:shadow-drawer @wide/five:static @wide/five:flex-none @wide/five:border-s @wide/five:border-border-hairline"
              in:paneSlide={{ leaving: false, from: "right" }}
              out:paneSlide={{ leaving: true, from: "right" }}
            >
              <CawPane
                {draft}
                onclose={() => {
                  caw = false;
                }}
                {read}
                {records}
                {sessionsStale}
                {spinning}
              />
            </aside>
          {/if}
        </div>
      </div>

      <div class="@phone/five:hidden">
        <PlacesRow
          {caw}
          form="bar"
          onplace={go}
          {place}
          {read}
          {records}
          {unread}
        />
      </div>
    </div>

    <MoreSheet
      {asking}
      onclose={() => {
        sheet = null;
      }}
      {records}
      {sheet}
    />
  </div>
</Tooltip.Provider>
