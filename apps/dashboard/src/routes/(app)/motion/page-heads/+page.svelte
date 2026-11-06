<script lang="ts">
  /**
   * A phone's own pages, for the page-heads probe: the real TaskPane and
   * FolderFile drawn as ProjectPage draws them under 900px (`page`, Back to
   * the project's name), fed a product-shaped task with no hub, so each
   * page's body says the hub didn't answer under its head. `?of=task` (the
   * default) or `?of=file`. The probe reads each head: Back the chevron
   * alone, named by where it goes; no id or path in the bar; the file's
   * name its title.
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
  const noop = () => undefined;
</script>

<div class="flex h-dvh min-h-0 flex-col" data-bench-page={of}>
  {#if of === "file"}
    <FolderFile
      onclose={noop}
      page={{ backTo: PROJECT }}
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
      page={{ backTo: PROJECT }}
      projectId={PROJECT_ID}
      {stages}
      taskId={TASK}
      {tasks}
    />
  {/if}
</div>
