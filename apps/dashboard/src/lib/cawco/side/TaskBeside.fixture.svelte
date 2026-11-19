<script lang="ts">
  import type { StagesView, TaskSummary } from "@cawco/core/task-views";
  import { DAY_MS, MINUTE_MS } from "@cawco/core/time";
  import { onMount, type Snippet, untrack } from "svelte";
  /**
   * Fixture for TaskBeside.stories.ts: a conversation and what stands
   * beside it (SideSplit), as SessionPane composes them. The transcript is
   * an agent's reply drawn by the conversation's own markdown (MessageBody),
   * its task and to-do chips the dashboard's own (ThingReference), standing
   * in the conversation its context names (tasks/beside-here.ts
   * `provideBeside`), so a press on one stands the task beside it. The task
   * stands as SessionPane stands it: TaskPane over the project's tasks and
   * stages, or the side card's failure when the hub refused them. The hub's
   * answers are held here, by path; the preview is the store's own, written
   * through its writer.
   */
  import type { FrameOf } from "#lib/cawco/hub/frames.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { hub } from "#lib/platform/hub.js";
  import { trackVisibleViewport } from "#lib/platform/visible-viewport.svelte.js";
  import MessageBody from "../MessageBody.svelte";
  import { provideMarkdownFleet } from "../markdown-fleet";
  import { liveMarkdown } from "../markdown-live";
  import type { TaskView } from "../project-tasks";
  import { takePreview } from "../stores/previews.svelte";
  import { besideOf, putAway, standBeside } from "../tasks/beside.svelte";
  import { provideBeside } from "../tasks/beside-here";
  import TaskPane from "../tasks/TaskPane.svelte";
  import { layoutPolicy } from "../workspace/layout-policy.svelte";
  import FailedSurface from "./FailedSurface.svelte";
  import SideSplit from "./SideSplit.svelte";

  let {
    standing,
    preview,
    refused,
  }: {
    /** What stands beside the conversation as the frame opens: the task, the task at a to-do, or nothing yet. */
    standing: "task" | "todo" | "none";
    /** The session's preview is open too, so the switch shows. */
    preview: boolean;
    /** The hub refused the project's tasks and stages. */
    refused: boolean;
  } = $props();

  const VIEW = "7c2e91b4-0d3a-4f5e-8b61-a9e4c3d27f10";
  const PROJECT = "pantry-rewrite";
  const TASK = "tsk-41";
  const TODO = "td-4";
  const now = Date.now();

  /** The project's stages, as its stages.md names them. */
  const stages: StagesView = {
    stages: [
      { name: "Ready", kind: "todo", hooks: {} },
      { name: "Doing", kind: "active", hooks: {} },
      { name: "Review", kind: "you", hooks: {} },
      { name: "Shipped", kind: "done", hooks: {} },
    ],
    moves: [{ from: "*", to: "*", who: ["you"] }],
    views: [],
    starters: [],
    routineStarters: [],
    decisionStarters: [],
    problems: [],
    template: null,
    source: "file",
  };

  const life = {
    archivedAt: null,
    closeReason: null,
    completedAt: null,
    droppedAt: null,
    startedAt: now - DAY_MS,
  };
  const flags = {
    attempts: [],
    builtOn: [],
    heldBy: null,
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    liveAttempt: false,
    parts: [],
    queuedStart: false,
    ready: false,
    startProblem: null,
    unblocks: [],
    waits: [],
  };
  const TITLE =
    "Move the checkout's address step onto one screen, the postcode lookup first";

  const view: TaskView = {
    ...flags,
    ...life,
    acceptance:
      "- The address step is one screen at 390 wide, no scrolling past the fold to reach Continue.\n- A postcode that finds no address says so under the field and keeps what was typed.\n- The old two-step flow is deleted, not hidden behind a flag.",
    checks: [],
    comments: [],
    createdAt: now - 3 * DAY_MS,
    createdBy: null,
    description:
      "Shoppers drop off on the address step more than on any other: 31% of the sessions that reach it last week never pressed Continue, against 9% on payment. Most of them are on a phone, and the step is two screens there, the postcode lookup on the second, so a shopper types their whole street before the lookup could have filled it.\n\nPut the postcode first. A found postcode fills the street, the town and the county, and the shopper only picks their house number from the list the lookup answers. Manual entry stays one tap away, under the field, for addresses the lookup does not know (new builds, flats with a letter).\n\nKeep the saved addresses above it for a signed-in shopper: their default first, the rest under More. The courier's delivery note moves to the review step, where it is read against the slot they picked.",
    duplicateOf: null,
    extra: {},
    foundIn: null,
    foundInNamed: null,
    hash: "9f3c21ab",
    id: TASK,
    kind: "active",
    labels: ["checkout", "mobile"],
    lands: null,
    links: [],
    needsYou: false,
    number: 41,
    outputs: [],
    partOf: null,
    path: `tasks/${TASK}.md`,
    problems: [],
    rank: null,
    result: null,
    sections: [],
    sendBack: null,
    stage: "Doing",
    title: TITLE,
    todos: [
      ["td-1", "Measure the drop-off per step from last week's sessions", true],
      ["td-2", "Draw the one-screen step at 390 and at 1440", true],
      [
        "td-3",
        "Answer the postcode lookup from the courier's address API",
        false,
      ],
      [
        "td-4",
        "Say a postcode that finds nothing under its field, keeping what was typed",
        false,
      ],
      ["td-5", "Delete the old two-step flow and its flag", false],
    ].map(([id, text, done], at) => ({
      depth: 0,
      done: done === true,
      id: String(id),
      path: String(at + 1),
      promoted: null,
      proposed: false,
      text: String(text),
    })),
    type: null,
    updatedAt: now - 40 * MINUTE_MS,
    updatedBy: null,
    waitsOn: [],
  };

  const summary: TaskSummary = {
    ...flags,
    ...life,
    createdAt: view.createdAt,
    createdBy: null,
    duplicateOf: null,
    fields: {},
    foundIn: null,
    id: TASK,
    kind: "active",
    labels: view.labels,
    links: [],
    needsYou: false,
    number: 41,
    outputs: [],
    partOf: null,
    path: view.path,
    problem: null,
    rank: null,
    stage: "Doing",
    title: TITLE,
    todos: { done: 2, total: 5 },
    type: null,
    updatedAt: view.updatedAt,
    updatedBy: null,
    waitsOn: [],
  };

  /** The project's reads, at the paths the hub's client asks them. */
  const project = hub.api.projects({ id: PROJECT });
  const read = project.tasks({ taskId: TASK });
  const LIST = project.tasks["~path"];
  const STAGES = project.stages["~path"];
  /** What the hub answers at each path for this project. */
  const held: Record<string, unknown> = {
    [read["~path"]]: view,
    [read.history["~path"]]: { events: [] },
    [LIST]: { tasks: [summary] },
    [STAGES]: stages,
  };
  /** The hub's answer to a read of `path`; null for what is no read of the hub's. */
  function answer(path: string): Response | null {
    if (refused && (path === LIST || path === STAGES)) {
      return Response.json(
        { error: "The project's folder is not on this machine." },
        { status: 503 }
      );
    }
    if (path in held) {
      return Response.json(held[path]);
    }
    return path.startsWith("/api/")
      ? Response.json({ error: "Not found." }, { status: 404 })
      : null;
  }
  const passOn = globalThis.fetch;
  globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      const answered = answer(new URL(href, location.href).pathname);
      return answered ? Promise.resolve(answered) : passOn(input, init);
    },
    { preconnect: passOn.preconnect }
  );

  // The conversation's preview, as the hub's frame opens it.
  const previewFrame: FrameOf<"preview"> = {
    instanceId: VIEW,
    kind: "preview",
    revision: "r1",
    show: "show-1",
    state: "open",
    artifact: {
      id: "art-checkout-390",
      kind: "preview",
      name: "checkout-address-390",
      title: "Checkout address step, at 390",
      ask: "Judge the one-screen address step on a phone",
    },
  };
  $effect(() => {
    const state = preview ? "open" : "closed";
    untrack(() => takePreview({ ...previewFrame, state }));
  });

  // What stands beside as the frame opens; a press on a chip stands the rest.
  $effect(() => {
    if (standing === "none") {
      putAway(VIEW);
    } else {
      standBeside(VIEW, {
        projectId: PROJECT,
        taskId: TASK,
        ...(standing === "todo" ? { todo: TODO } : {}),
      });
    }
  });

  // The visible area the sheet takes its stops from, as the app's root
  // layout publishes it.
  onMount(trackVisibleViewport);
  provideMarkdownFleet(() => liveMarkdown);
  provideBeside(() => VIEW);

  const beside = $derived(besideOf(VIEW));
  // The task just put away stays in its card while the card goes, as SessionPane keeps it.
  let last = $state(untrack(() => beside));
  $effect(() => {
    if (beside) {
      last = beside;
    }
  });
  const drawn = $derived(beside ?? last);
  let width = $state(0);
  const measure = frameSize(
    (node: HTMLElement) => node.clientWidth,
    (value) => {
      width = value;
    }
  );

  const REPLY = `I read the checkout's address step against last week's sessions: [${TITLE}](cawco:task/${PROJECT}/${TASK}) is the one to do first, since 31% of shoppers who reach the step leave on it.\n\nTwo of its to-dos are done. The one I would take next is [the postcode that finds nothing](cawco:todo/${PROJECT}/${TASK}/${TODO}), because it is where a shopper loses what they typed.`;
</script>

{#snippet taskCard(switcher: Snippet | undefined, sheet: boolean)}
  {#if drawn && !refused}
    <TaskPane
      allowedFrom={() => new Set(["Ready", "Review", "Shipped"])}
      onchanged={() => undefined}
      onclose={() => putAway(VIEW)}
      onmove={() => Promise.resolve(view)}
      onopen={() => undefined}
      projectId={drawn.projectId}
      {sheet}
      {stages}
      {switcher}
      taskId={drawn.taskId}
      tasks={[summary]}
      todo={drawn.todo}
    />
  {:else if drawn}
    <FailedSurface onclose={() => putAway(VIEW)} {switcher} what="task">
      <div class="p-space-3">
        <Alert variant="destructive">
          <AlertDescription>
            The project's folder is not on this machine.
          </AlertDescription>
        </Alert>
      </div>
    </FailedSurface>
  {/if}
{/snippet}

<div class="flex h-dvh min-h-0 w-full" {@attach measure}>
  <SideSplit
    active
    phone={layoutPolicy.sideDrawer(width)}
    task={taskCard}
    taskOpen={!!beside}
    viewId={VIEW}
    visible
  >
    <div class="h-full overflow-y-auto p-space-4" data-slot="transcript">
      <MessageBody at="task-beside" source={REPLY} />
    </div>
  </SideSplit>
</div>
