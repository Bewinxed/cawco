<script lang="ts">
  /**
   * The Standing card where it stands: over the project's page as the app
   * draws it (the rail, the project's own head, its board under the head),
   * hung from the head's place mark. The head's own details tray stays shut:
   * a press on the place mark is taken here and opens the card instead, and
   * a press outside, Escape or the mark again puts it away.
   *
   * What the hub would hold is held here: the project's row, which a pick
   * changes once the stand-in hub has answered.
   */
  import type { StagesView, TaskSummary } from "@cawco/core/task-views";
  import type { TrackerView } from "@cawco/core/trackers";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { firstTodoStage } from "#lib/cawco/project-tasks.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import Sidebar from "#lib/cawco/Sidebar.svelte";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import type { AccountChoice, DecidesStanding, PlaceFolder } from "./details";
  import StandingCard from "./StandingCard.svelte";
  import { standingWords } from "./words";

  let {
    project,
    machines,
    folders,
    decides,
    tracker,
    accounts,
    stages,
    tasks,
    open = true,
  }: {
    project: ProjectRow;
    machines: Machine[];
    folders: Record<string, PlaceFolder>;
    decides: DecidesStanding;
    tracker: TrackerView;
    accounts: AccountChoice[];
    stages: StagesView;
    tasks: TaskSummary[];
    /** The card stands open over the page as the frame opens. */
    open?: boolean;
  } = $props();

  /** How long the stand-in hub takes to answer a change. */
  const ANSWER_MS = 700;

  /** The project's row as the stand-in hub holds it: the story's, until a pick changes it. */
  let row = $derived(project);
  /** The card stands: the story's, until the mark or a press outside moves it. */
  let shown = $derived(open);

  /** The hub answers a change after its wait: the row takes it. */
  function answer(change: Partial<ProjectRow>): void {
    setTimeout(() => {
      row = { ...row, ...change };
    }, ANSWER_MS);
  }

  const lead = new CawLead({
    id: () => row.id,
    machinesOnline: () => true,
    project: () => row,
    reading: () => false,
    tasks: () => tasks,
  });

  const machine = $derived(
    machines.find(
      (one) =>
        one.machineId === row.places.find((place) => place.isPrimary)?.machineId
    ) ?? null
  );
  const newIn = $derived(firstTodoStage(stages.stages)?.name);

  let pageBox = $state<HTMLElement | null>(null);
  /** The head's place mark, which the card hangs from. */
  let mark = $state<HTMLElement | null>(null);
  $effect(() => {
    mark = pageBox?.querySelector<HTMLElement>("[data-place-line]") ?? null;
  });

  // A press on the place mark (a click, or Enter or Space on it) opens or
  // puts away the card, never the head's own tray: taken on its way down.
  $effect(() => {
    const box = pageBox;
    box?.addEventListener("click", takeMark, true);
    return () => box?.removeEventListener("click", takeMark, true);
  });

  /** A press on the place mark opens or puts away the card, never the head's own tray. */
  function takeMark(event: MouseEvent): void {
    if (mark && event.target instanceof Node && mark.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      shown = !shown;
    }
  }

  const none = () => undefined;
</script>

<div
  class="@container/shell relative flex h-225 w-full overflow-hidden bg-surface-recess"
>
  <aside
    class="hidden w-c-sidebar-w min-w-0 shrink-0 border-e border-e-border-hairline bg-(--sidebar) desk:flex"
  >
    <Sidebar narrow={false} toggleRoom />
  </aside>
  <div bind:this={pageBox} class="flex min-w-0 flex-auto flex-col">
    <ProjectDock docked={false} preview={false}>
      {#snippet page()}
        <ProjectHead
          {lead}
          {machine}
          onask={null}
          onfilter={none}
          onnewtask={none}
          project={row}
          seated
          setup={null}
        />
        <div
          class="flex min-h-0 flex-auto flex-col ps-space-7 pe-space-6 max-desk:px-space-5"
        >
          <TaskBoard
            allowedFrom={() => new Set<string>()}
            hrefOf={() => "#"}
            {newIn}
            oncreate={async () => ""}
            onmove={none}
            onopen={none}
            stages={stages.stages}
            {tasks}
          />
        </div>
      {/snippet}
      {#snippet dock()}{/snippet}
    </ProjectDock>
  </div>
</div>

{#if mark}
  <Popover.Root bind:open={shown}>
    <Popover.Content
      align="start"
      aria-label={standingWords.card}
      style="--pop-w: min(calc(var(--spacing) * 180), calc(100vw - 2 * var(--spacing-space-5)))"
      width="room"
      customAnchor={mark}
      height="available"
      onInteractOutside={(event) => {
        if (
          mark &&
          event.target instanceof Node &&
          mark.contains(event.target)
        ) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => event.preventDefault()}
      overflow="scroll"
      pad="none"
      side="bottom"
      sideOffset={6}
    >
      <StandingCard
        {accounts}
        {decides}
        {folders}
        {machines}
        onaccount={(account) => answer({ account })}
        onaddplace={none}
        onatlimit={(accountAtLimit) => answer({ accountAtLimit })}
        ondrop={none}
        onfind={none}
        onlands={(lands) => answer({ lands })}
        onlfs={none}
        onmove={none}
        onopendecides={none}
        onreview={(review) => answer({ review })}
        onstages={none}
        onsync={none}
        ontracker={none}
        project={row}
        {tracker}
      />
    </Popover.Content>
  </Popover.Root>
{/if}
