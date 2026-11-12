<script lang="ts">
  /**
   * A task's and a folder file's heads, for the page-heads probe: the real
   * TaskPane and FolderFile fed a product-shaped task with no hub, so each
   * body says the hub didn't answer under its head. `?of=task` (the
   * default) or `?of=file`; `?at=phone` (the default) draws each as
   * ProjectPage does under 900px (`page`, Back to the project's name),
   * `?at=desk` as the side card beside the board (SideSurface, in a card
   * as wide as Split stands it). The probe reads each head: Back the
   * chevron alone, named by where it goes; no id or path in the bar; the
   * file's name its title.
   */
  import type { StagesView, TaskSummary } from "@cawco/core/task-views";
  import { DAY_MS, MINUTE_MS } from "@cawco/core/time";
  import FolderFile from "#lib/cawco/project/FolderFile.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import { page } from "$app/state";

  const PROJECT = "Pantry rewrite";
  const PROJECT_ID = "0b7d4c2e-5a1f-4e8b-9c3d-2f6a1e0b9d47";
  const TASK = "tsk-41";
  const FILE =
    "assets/9f3c21ab/checkout-address-step/2026-11-05-whole-flow-at-390.md";
  const now = Date.now();

  const stages: StagesView = {
    decisionStarters: [],
    moves: [{ from: "*", to: "*", who: ["you"] }],
    problems: [],
    routineStarters: [],
    source: "file",
    stages: (
      [
        ["Backlog", "todo"],
        ["Doing", "active"],
        ["Review", "you"],
        ["Done", "done"],
      ] as const
    ).map(([name, kind]) => ({ hooks: {}, kind, name })),
    starters: [],
    template: null,
    views: [],
  };
  const tasks: TaskSummary[] = [
    {
      archivedAt: null,
      attempts: [],
      builtOn: [],
      closeReason: null,
      completedAt: null,
      createdAt: now - 3 * DAY_MS,
      createdBy: null,
      droppedAt: null,
      duplicateOf: null,
      fields: {},
      foundIn: null,
      heldBy: null,
      id: TASK,
      kind: "active",
      labels: ["checkout", "mobile"],
      lastAttemptFailed: false,
      lastAttemptStopped: false,
      links: [],
      liveAttempt: false,
      needsYou: false,
      number: 41,
      outputs: [FILE],
      partOf: null,
      parts: [],
      path: `tasks/${TASK}.md`,
      problem: null,
      queuedStart: false,
      rank: null,
      ready: false,
      stage: "Doing",
      startedAt: now - DAY_MS,
      startProblem: null,
      title:
        "Move the checkout's address step onto one screen, the postcode lookup first",
      todos: { done: 2, total: 5 },
      type: null,
      unblocks: [],
      updatedAt: now - 40 * MINUTE_MS,
      updatedBy: null,
      waits: [],
      waitsOn: [],
    },
  ];
  const of = $derived(page.url.searchParams.get("of") ?? "task");
  const desk = $derived(page.url.searchParams.get("at") === "desk");
  const phonePage = $derived(desk ? undefined : { backTo: PROJECT });
  const noop = () => undefined;
</script>

<div
  class="flex h-dvh min-h-0 flex-col data-desk:w-(--card-w) data-desk:p-space-3"
  data-bench-page={of}
  data-desk={desk || undefined}
  style:--card-w={"max(45vw, var(--spacing-c-side-surface-min))"}
>
  {#if of === "file"}
    <FolderFile
      onclose={noop}
      page={phonePage}
      path={FILE}
      projectId={PROJECT_ID}
    />
  {:else}
    <TaskPane
      allowedFrom={() => new Set(["Backlog", "Review", "Done"])}
      onchanged={noop}
      onclose={noop}
      onmove={() => Promise.reject(new Error("bench"))}
      onopen={noop}
      page={phonePage}
      projectId={PROJECT_ID}
      {stages}
      taskId={TASK}
      {tasks}
    />
  {/if}
</div>
