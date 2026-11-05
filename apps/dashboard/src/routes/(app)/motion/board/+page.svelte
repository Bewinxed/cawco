<script lang="ts">
  import { byRank } from "@cawco/core/task-views";
  import { onMount } from "svelte";
  import { standBench } from "#lib/cawco/bench-api.js";
  /**
   * BOARD BENCH (dev only): a set-up project's board as its cards are
   * carried between columns, drawn by the real board (TaskBoard on
   * drag/DragProvider) from Private office's stages and tasks shaped as the
   * hub serves them (waiting.fixtures.ts), no hub.
   *
   * Every card moves as the product's do: picked up, it lifts under the
   * hand; over a column it may go to, its place opens there; the columns it
   * may not go to step back. This bench's moves, as a project's stages.md
   * would set them: Sending and Sent are the sender's, so a person's card
   * may go anywhere but there. The bench answers each move as the hub does,
   * after a beat: a card let go in Won is refused, with the hub's sentence
   * under it and Try again; any other move is taken. One card stands in a
   * stage stages.md does not name (Parked), in Other stages, and is carried
   * out of it like any other.
   *
   * The page stands on the bench's own hub (client.svelte.ts `standHub`,
   * bench-api.ts `standBench`): the project in the rail, its limits read, and
   * no band saying the dev server has no hub.
   */
  import {
    PO_ID,
    PO_NAME,
    PO_ROW,
    PO_STAGES,
    PO_TASKS,
  } from "#lib/cawco/project/waiting.fixtures.js";
  import {
    firstTodoStage,
    movesFrom,
    type StagesView,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import type { RankWrite } from "#lib/cawco/tasks/rank.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import { browser } from "$app/env";

  /** The sender's stages: a person's card is not moved into them. */
  const SENDERS = new Set(["sending", "sent"]);
  const stagesView: StagesView = {
    ...PO_STAGES,
    moves: PO_STAGES.stages
      .filter((stage) => !SENDERS.has(stage.name))
      .map((stage) => ({ from: "*", to: stage.name, who: ["you"] })),
  };
  /** How long the bench's hub takes to answer a move, in ms. */
  const ANSWER_MS = 700;

  const [template] = PO_TASKS as [TaskSummary];
  /** The office's work in flight, a column of it at a time. */
  const CARDS: [string, string][] = [
    ["inbox", "Book the visa appointment in Riyadh"],
    ["inbox", "Renew the passport before March"],
    ["inbox", "Reply to the recruiter at Linear"],
    ["scouting", "Shortlist remote roles in developer tools"],
    ["scouting", "Find flights for the Lisbon interview"],
    ["drafting", "Draft the cover letter for Supabase"],
    ["drafting", "Write the launch post for the side project"],
    ["your-call", "Approve the reply to the Stripe recruiter"],
    ["sent", "Application to Vercel, design engineer"],
    ["parked", "Renew the gym membership"],
  ];
  let tasks = $state<TaskSummary[]>(
    CARDS.map(([stage, title], at) => ({
      ...template,
      id: `tsk-${at + 3}`,
      number: at + 3,
      path: `tasks/tsk-${at + 3}.md`,
      title,
      stage,
      kind: PO_STAGES.stages.find((one) => one.name === stage)?.kind ?? null,
      needsYou: stage === "your-call",
      waits: [],
      waitsOn: [],
      closeReason: null,
      droppedAt: null,
    }))
  );
  // --- the bench's hub ----------------------------------------------------------
  const restore = browser
    ? standBench(PO_ROW, (path, method) =>
        method === "GET" && path === `/api/projects/${PO_ID}/stages`
          ? stagesView
          : undefined
      )
    : () => undefined;
  onMount(() => restore);

  /** Moves the bench's hub has not answered, by task. */
  let moving = $state<Record<string, string>>({});
  /** Moves it refused, by task. */
  let refused = $state<
    Record<string, { reason: string; stage: string; ranks: RankWrite[] }>
  >({});

  /** The bench's list takes `ranks` and sorts as the hub does (core `byRank`). */
  function holdRanks(ranks: RankWrite[]) {
    const rankOf = new Map(ranks.map((one) => [one.id, one.rank]));
    tasks = tasks
      .map((task) =>
        rankOf.has(task.id)
          ? { ...task, rank: rankOf.get(task.id) ?? null }
          : task
      )
      .toSorted(byRank);
  }
  function move(id: string, stage: string, ranks: RankWrite[] = []) {
    const { [id]: _, ...rest } = refused;
    refused = rest;
    const before = tasks;
    holdRanks(ranks);
    moving = { ...moving, [id]: stage };
    setTimeout(() => {
      const { [id]: _done, ...still } = moving;
      moving = still;
      if (stage === "won") {
        tasks = before;
        refused = {
          ...refused,
          [id]: {
            stage,
            ranks,
            reason: `${id} has to-dos still open, so it can't move to won. It can move to inbox, scouting, drafting, your-call, follow-up or dropped.`,
          },
        };
        return;
      }
      tasks = tasks.map((task) => (task.id === id ? { ...task, stage } : task));
    }, ANSWER_MS);
  }
  /** The board's tasks, each move not answered yet standing where it was put. */
  const shown = $derived(
    tasks.map((task) =>
      task.id in moving
        ? { ...task, stage: moving[task.id] ?? task.stage }
        : task
    )
  );
</script>

<div
  class="flex h-dvh min-h-0 flex-col gap-space-4 px-space-7 pt-space-4 max-desk:px-space-5"
  data-slot="board-bench"
>
  <h1 class="m-0 type-title text-ink-strong">{PO_NAME}</h1>
  <div class="min-h-0 min-w-0 flex-auto">
    <TaskBoard
      allowedFrom={(from) => movesFrom(stagesView, from)}
      hrefOf={(id) => `?task=${id}`}
      moving={(id) => id in moving}
      newIn={firstTodoStage(stagesView.stages)?.name}
      oncreate={async () => ""}
      onmove={move}
      onrank={(_id, ranks) => holdRanks(ranks)}
      onopen={() => undefined}
      refused={(id) => {
        const one = refused[id];
        return one
          ? {
              reason: one.reason,
              again: () => move(id, one.stage, one.ranks),
            }
          : null;
      }}
      stages={stagesView.stages}
      tasks={shown}
    />
  </div>
</div>
