<script lang="ts">
  /**
   * The project page's four parts fixed from the owner's pins, drawn in the
   * real components on the tidewater fixtures, for the project-parts probe
   * (scripts/probe-kit/specs/web/project-parts.ts). `?part=`:
   * - `cards`: a board column of every card state (TaskColumn, TaskCard),
   *   one card with a forty-word title;
   * - `board` (`&starters=one|four|long`), `decisions`: the empty board
   *   and the empty Decisions tab in the work column (WorkColumnEmpty,
   *   StarterCards), in the page's own padding;
   * - `routines`: the empty Routines block (Block, RoutinesEmpty);
   * - `head` (`&name=short|long`): the project head (ProjectHead);
   * - `pane` (`&task=tsk-16`): the task pane (TaskPane), its side card
   *   beside the board on a desk, its own page under 640px.
   * Every hub read they make of their own accord is answered from the
   * fixtures (tidewater.ts `answerReads`); a press goes where it would.
   */
  import { decisionsWords, routinesWords } from "@cawco/core";
  import { MediaQuery } from "svelte/reactivity";
  import Block from "#lib/cawco/blocks/Block.svelte";
  import { BlockDragState } from "#lib/cawco/blocks/block-dnd.svelte.js";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import WorkColumnEmpty from "#lib/cawco/project/WorkColumnEmpty.svelte";
  import { movesFrom } from "#lib/cawco/project-tasks.js";
  import TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import RoutinesEmpty from "#lib/cawco/routines/RoutinesEmpty.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClock } from "#lib/icons.js";
  import { page as here } from "$app/state";
  import {
    answerReads,
    BOARD_STARTERS,
    DATES,
    kindOf,
    LONG,
    MACHINE,
    PROJECT,
    projectRow,
    ROUTINE_STARTERS,
    STAGES,
    TASKS,
    taskOf,
    viewOf,
  } from "./tidewater";

  answerReads();

  const part = $derived(here.url.searchParams.get("part") ?? "cards");
  const name = $derived(
    here.url.searchParams.get("name") === "long" ? LONG : PROJECT
  );
  const starters = $derived(
    BOARD_STARTERS[here.url.searchParams.get("starters") ?? "four"] ??
      BOARD_STARTERS.four ??
      []
  );
  const taskId = $derived(here.url.searchParams.get("task") ?? "tsk-16");
  const phone = new MediaQuery("(max-width: 639px)");

  const lead = new CawLead({
    id: () => PROJECT,
    project: () => projectRow(PROJECT),
    machinesOnline: () => true,
    tasks: () => TASKS,
    reading: () => false,
  });
  const drag = new BlockDragState();
  const noop = () => undefined;
  const CARD_ORDER = [
    "tsk-19",
    "tsk-15",
    "tsk-17",
    "tsk-14",
    "tsk-18",
    "tsk-16",
    "tsk-21",
    "tsk-20",
    "tsk-12",
    "tsk-22",
  ];
</script>

{#snippet createByHand()}
  <Button label={routinesWords.createRoutine} variant="outline" />
{/snippet}

{#snippet caw()}
  <div data-slot="caw-80" class="mb-space-3 grid justify-items-start">
    <CawSeat {lead} projectId={PROJECT} projectName={PROJECT} size={80} />
  </div>
{/snippet}

<main
  class="flex min-h-dvh w-full min-w-0 flex-col bg-surface-recess"
  data-bench="project-parts"
  data-part={part}
>
  {#if part === "cards"}
    <div
      class="w-full max-w-c-board-col-max p-space-3 max-phone:max-w-none"
      data-cards
    >
      <TaskColumn
        cards={CARD_ORDER.map(taskOf)}
        dateOf={(id) => DATES[id] ?? null}
        hrefOf={(id) => `?part=pane&task=${id}`}
        kind={null}
        {kindOf}
        label="Every state"
        onopen={noop}
      />
    </div>
  {:else if part === "board" || part === "decisions"}
    <div
      class="flex w-full min-w-0 flex-col pt-space-5 ps-space-7 pe-space-6 pb-space-6 max-desk:px-space-5"
      data-room
    >
      {#if part === "board"}
        <WorkColumnEmpty
          data-slot="caw-empty"
          line="Tell Caw what to do: the tasks Caw files move through Ready, Working, Review and Done. One waiting on you shows in Review."
          mark={caw}
          title="Nothing on the board yet"
        >
          <StarterCards onpick={noop} {starters} />
        </WorkColumnEmpty>
      {:else}
        <WorkColumnEmpty
          line={decisionsWords.emptyCaw}
          mark={caw}
          title={decisionsWords.empty}
        >
          <StarterCards onpick={noop} {starters} />
        </WorkColumnEmpty>
      {/if}
    </div>
  {:else if part === "routines"}
    <div
      class="flex w-full min-w-0 flex-col pt-space-5 ps-space-7 pe-space-6 pb-space-6 max-desk:px-space-5"
      data-room
    >
      <!-- The empty Routines block as the page draws it: the real Block
           with its head, its body ViewRoutines' empty one. -->
      <Block
        body="capped"
        card
        columns={1}
        {drag}
        first
        glyph={IconClock}
        hideable
        id="routines"
        last
        onhide={noop}
        onmove={noop}
        ontab={noop}
        onwidth={noop}
        page="routines"
        resizing={false}
        span={1}
        title={routinesWords.tab}
        view={null}
        wideOnly={false}
        width="wide"
      >
        <div data-slot="starters" class="p-space-3">
          <RoutinesEmpty
            byHand={createByHand}
            canTalk
            onask={noop}
            projectName={PROJECT}
            starters={ROUTINE_STARTERS}
          />
        </div>
      </Block>
    </div>
  {:else if part === "head"}
    <ProjectHead
      {lead}
      machine={MACHINE}
      onask={noop}
      onfilter={noop}
      onnewtask={noop}
      onstages={null}
      project={projectRow(name)}
      seated
    />
  {:else if part === "pane"}
    {#if phone.current}
      <div class="flex h-dvh min-h-0 w-full flex-col" data-pane-room>
        <TaskPane
          allowedFrom={(stage) => movesFrom(STAGES, stage)}
          onchanged={noop}
          onclose={noop}
          onmove={async () => viewOf(taskId)}
          onopen={noop}
          page
          projectId={PROJECT}
          stages={STAGES}
          {taskId}
          tasks={TASKS}
        />
      </div>
    {:else}
      <!-- The side card as Split stands it beside the board: 45% of the
           page, never under its floor, inside its inset. -->
      <div
        class="ms-auto flex h-dvh w-(--card-w) max-w-full min-w-0 flex-col p-space-3"
        data-pane-room
        style:--card-w={"max(45vw, var(--c-side-surface-min))"}
      >
        <TaskPane
          allowedFrom={(stage) => movesFrom(STAGES, stage)}
          onchanged={noop}
          onclose={noop}
          onmove={async () => viewOf(taskId)}
          onopen={noop}
          projectId={PROJECT}
          stages={STAGES}
          {taskId}
          tasks={TASKS}
        />
      </div>
    {/if}
  {/if}
</main>
