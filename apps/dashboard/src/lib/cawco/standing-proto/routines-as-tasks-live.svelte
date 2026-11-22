<script lang="ts">
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import {
    firstTodoStage,
    type TaskSummary,
    type TaskView,
  } from "#lib/cawco/project-tasks.js";
  import { FIRST_WHEN, type When } from "#lib/cawco/routines/when.js";
  import Split from "#lib/cawco/side/Split.svelte";
  /**
   * CawCo Cloud's project page, with routines as tasks that repeat: its
   * head, its view strip and the view beside the task open on it, as
   * ProjectPage composes them. Routines is the board's tasks that repeat,
   * each an outcome row (OutcomeList); the Board (TaskBoard) draws every
   * task, a repeating one with its repeats mark and its answer (`answerOf`);
   * either opens a task on the same page (TaskPane, with a repeating task's
   * alert, Runs tab and Repeats section), and New task asks how it repeats
   * (NewTaskForm `fields`: RepeatFields).
   *
   * Its `$state` is what the mock hub holds: the tasks and their repeats,
   * the view on show, the task open, the new task's form, Caw's draft.
   */
  import { setTaskProject } from "#lib/cawco/tasks/needs.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus, IconSparkles } from "#lib/icons.js";
  import OutcomeList from "./OutcomeList.svelte";
  import RepeatAlert from "./RepeatAlert.svelte";
  import RepeatFields from "./RepeatFields.svelte";
  import RepeatRuns from "./RepeatRuns.svelte";
  import RepeatSettings from "./RepeatSettings.svelte";
  import {
    EVENTS,
    type RepeatDraft,
    type RepeatKind,
    scheduleWords,
  } from "./repeat-draft";
  import { cardAnswer } from "./repeat-words";
  import {
    HUB_ANSWERS,
    holdProject,
    holdTask,
    initialTasks,
    MOCK_MACHINE,
    MOCK_PROJECT,
    PROJECT_ID,
    PROJECT_VIEWS,
    REPEATS,
    type Repeat,
    STAGES,
    summaryOf,
    viewOf,
  } from "./repeating-data";

  interface Props {
    /** New task's form stands open as it opens. */
    adding?: boolean;
    /** The task it opens with beside the view. */
    open?: string | null;
    /** How the form's Repeat stands as it opens. */
    repeat?: RepeatKind;
    /** The view it opens on. */
    view?: "routines" | "board";
  }

  let {
    view = "routines",
    open = null,
    adding = false,
    repeat = "never",
  }: Props = $props();

  setTaskProject(() => PROJECT_ID);
  holdProject();

  /** The hub's reads answered from what it holds, as TaskBeside's fixture answers them; anything else passes on. */
  const passOn = globalThis.fetch;
  globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      const path = new URL(href, location.href).pathname;
      return path in HUB_ANSWERS
        ? Promise.resolve(Response.json(HUB_ANSWERS[path]))
        : passOn(input, init);
    },
    { preconnect: passOn.preconnect }
  );

  /** What the mock hub holds. */
  let tasks = $state<TaskSummary[]>(initialTasks());
  let repeats = $state<Record<string, Repeat>>(structuredClone(REPEATS));
  /** Each follows its arg until the person changes it in the frame. */
  let current = $derived<string>(view);
  let openTask = $derived(open);
  let formOpen = $derived(adding);
  /** New task opened from Routines asks for a schedule first. */
  let repeatKind = $derived<RepeatKind>(repeat);
  let repeatWhen = $state<When>({ ...FIRST_WHEN, repeat: "weekdays" });
  let repeatEvent = $state<string>(EVENTS[0]);
  let doneWhen = $state("");
  let seq = 220;

  const lead = new CawLead({
    id: () => PROJECT_ID,
    machinesOnline: () => true,
    project: () => MOCK_PROJECT,
    reading: () => false,
    tasks: () => tasks,
  });

  const repeatOf = (id: string) => repeats[id] ?? null;
  const answerOf = (id: string) => {
    const one = repeats[id];
    const task = tasks.find((each) => each.id === id);
    return one && task ? cardAnswer(task.title, one) : null;
  };
  const allStages = new Set(STAGES.stages.map((stage) => stage.name));
  const newIn = firstTodoStage(STAGES.stages)?.name;

  function choose(next: string) {
    current = next;
  }

  function newTask() {
    repeatKind = current === "routines" ? "schedule" : "never";
    current = "board";
    formOpen = true;
  }

  function askCaw(prompt: string) {
    lead.ask(prompt, current === "board" ? "board" : "routines");
  }

  /** As the hub would write it: a task, and its repeat when it has one. */
  function create(title: string, stage: string) {
    const draft: RepeatDraft = {
      doneWhen: doneWhen.trim(),
      event: repeatEvent,
      kind: repeatKind,
      words: scheduleWords(repeatWhen),
    };
    doneWhen = "";
    seq += 1;
    const id = `tsk-${seq}`;
    const task = summaryOf({
      createdAt: Date.now(),
      id,
      kind: STAGES.stages.find((each) => each.name === stage)?.kind ?? "todo",
      stage,
      title,
    });
    if (draft.kind !== "never") {
      repeats[id] = {
        end: draft.doneWhen ? "until-true" : "keeps",
        kind: draft.doneWhen ? "fact" : "delivery",
        noun: "runs",
        runs: [],
        state: "on",
        trigger:
          draft.kind === "event"
            ? { kind: "event", words: draft.event }
            : { kind: "schedule", words: draft.words },
      };
    }
    tasks = [...tasks, task];
    holdTask(task);
    return Promise.resolve(id);
  }

  function changeRepeat(id: string, draft: RepeatDraft) {
    const was = repeats[id];
    if (!was || draft.kind === "never") {
      return;
    }
    repeats[id] = {
      ...was,
      end: draft.doneWhen ? "until-true" : "keeps",
      trigger:
        draft.kind === "event"
          ? { kind: "event", words: draft.event }
          : { kind: "schedule", words: draft.words },
    };
  }

  function moved(id: string, stage: string): Promise<TaskView> {
    tasks = tasks.map((each) =>
      each.id === id
        ? {
            ...each,
            kind:
              STAGES.stages.find((one) => one.name === stage)?.kind ??
              each.kind,
            stage,
          }
        : each
    );
    const task = tasks.find((each) => each.id === id);
    if (!task) {
      return Promise.reject(new Error(`The stand-in hub holds no ${id}.`));
    }
    holdTask(task);
    return Promise.resolve(viewOf(task));
  }
</script>

{#snippet repeatFields()}
  <RepeatFields
    id="new-task"
    bind:doneWhen
    bind:happens={repeatEvent}
    bind:kind={repeatKind}
    bind:when={repeatWhen}
  />
{/snippet}

{#snippet strip()}
  <div
    class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
    data-slot="strip"
  >
    <ViewTabs
      {current}
      hrefOf={(each) => `#${each}`}
      onchoose={choose}
      views={PROJECT_VIEWS}
    />
    <span
      aria-hidden="true"
      class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
    ></span>
    <div class="flex flex-none items-center gap-space-2" data-form="compact">
      <Button
        aria-label="New task"
        layout="wide"
        onclick={newTask}
        press="pressable"
        size="sm"
        title="New task"
        variant="ghost"
      >
        <IconPlus />
        <span class="in-form-compact:hidden">New task</span>
      </Button>
      <Button
        aria-label="Ask Caw"
        layout="wide"
        onclick={() => askCaw("")}
        press="pressable"
        size="sm"
        title="Ask Caw"
        variant="ghost"
      >
        <IconSparkles />
        <span class="in-form-compact:hidden">Ask Caw</span>
      </Button>
    </div>
  </div>
{/snippet}

{#snippet viewPane()}
  <div
    class={[
      "group flex min-h-0 max-w-full flex-auto flex-col overflow-y-auto pt-0 view-board:overflow-hidden",
      PANE_INSET,
    ]}
    data-slot="pane"
    data-view={current}
  >
    {#if current === "board"}
      <TaskBoard
        allowedFrom={() => allStages}
        {answerOf}
        hrefOf={(id) => `?task=${id}`}
        {newIn}
        newTaskFields={repeatFields}
        oncreate={create}
        onmove={(id, stage) => {
          moved(id, stage);
        }}
        onopen={(id) => {
          openTask = id;
        }}
        stages={STAGES.stages}
        {tasks}
        bind:adding={formOpen}
      />
    {:else}
      <OutcomeList
        onfix={askCaw}
        onopen={(id) => {
          openTask = id;
        }}
        {repeatOf}
        selected={openTask}
        {tasks}
      />
    {/if}
  </div>
{/snippet}

{#snippet sideCard()}
  {#if openTask}
    {@const id = openTask}
    {@const repeating = repeatOf(id)}
    {@const title = tasks.find((each) => each.id === id)?.title ?? ""}
    {#key id}
      {#snippet notice()}
        {#if repeating}
          <RepeatAlert onfix={askCaw} repeat={repeating} {title} />
        {/if}
      {/snippet}
      {#snippet runs()}
        {#if repeating}
          <RepeatRuns projectId={PROJECT_ID} repeat={repeating} taskId={id} />
        {/if}
      {/snippet}
      {#snippet detailsHead()}
        {#if repeating}
          <RepeatSettings
            onaskcaw={askCaw}
            onchange={(draft) => changeRepeat(id, draft)}
            repeat={repeating}
            {title}
          />
        {/if}
      {/snippet}
      <TaskPane
        notice={repeating ? notice : undefined}
        allowedFrom={() => allStages}
        detailsHead={repeating ? detailsHead : undefined}
        onchanged={() => undefined}
        onclose={() => {
          openTask = null;
        }}
        onmove={moved}
        onopen={(next) => {
          openTask = next;
        }}
        projectId={PROJECT_ID}
        runs={repeating ? runs : undefined}
        stages={STAGES}
        taskId={id}
        {tasks}
      />
    {/key}
  {/if}
{/snippet}

<div
  class="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
  data-slot="project-page"
>
  <ProjectHead
    {lead}
    machine={MOCK_MACHINE}
    onask={() => askCaw("")}
    onfilter={() => undefined}
    onnewtask={newTask}
    project={MOCK_PROJECT}
    seated
    setup={null}
  />
  {@render strip()}
  <Split
    backLabel="Back to {current === 'board' ? 'board' : 'routines'}"
    defaultWidth={40}
    keys={{
      expanded: "cawco.standing-proto.expanded",
      width: "cawco.standing-proto.width",
    }}
    main={viewPane}
    open={openTask !== null}
    side={sideCard}
  />
</div>
