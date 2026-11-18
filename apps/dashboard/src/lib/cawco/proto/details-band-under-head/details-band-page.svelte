<script lang="ts">
  import type { DecidesTable } from "@cawco/core/decides";
  import type { Stage, TaskSummary } from "@cawco/core/task-views";
  import type { TrackerView } from "@cawco/core/trackers";
  /**
   * The project page as it ships around the band, for DetailsBand's states
   * file: the rail (Sidebar), then the project's page (ProjectDock) with
   * its head (ProjectHead, its own details tray closed), the band under the
   * head, the view strip (ViewTabs) and the board (TaskBoard), fed the
   * records the story names.
   *
   * The head's place mark opens and closes the band here, as it would once
   * the band replaces the head's tray: its press is taken before the head
   * hears it. Escape closes the band. What the mock hub would hold is the
   * only state of its own: whether the band stands.
   */
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import Sidebar from "#lib/cawco/Sidebar.svelte";
  import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  import type { MoveUnderWay, PlaceStanding } from "./band-model";
  import DetailsBand from "./DetailsBand.svelte";

  let {
    open,
    project,
    machines,
    accounts,
    tracker,
    decides,
    standings,
    move,
    stages,
    tasks,
  }: {
    /** The band stands under the head. */
    open: boolean;
    project: ProjectRow;
    machines: Machine[];
    accounts: AccountsView;
    tracker: TrackerView;
    decides: DecidesTable;
    standings: Record<string, PlaceStanding>;
    move: MoveUnderWay | null;
    stages: Stage[];
    tasks: TaskSummary[];
  } = $props();

  /** Whether the band stands: the story's, until the place mark or Close says otherwise. */
  let standing = $derived(open);

  setSidebar({ open: () => true, setOpen: () => undefined });

  const lead = new CawLead({
    id: () => project.id,
    machinesOnline: () => true,
    project: () => project,
    reading: () => false,
    tasks: () => tasks,
  });

  const machine = $derived(
    machines.find(
      (one) =>
        one.machineId ===
        project.places.find((place) => place.id === project.primaryPlaceId)
          ?.machineId
    ) ?? null
  );
  const names = $derived(stages.map((stage) => stage.name));
  const views = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 0 },
  ];
  const none = () => undefined;
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && standing) {
      standing = false;
    }
  }}
/>

<!-- The shell's ground: the rail, then the project's page beside it. -->
<div
  class="flex h-dvh w-full overflow-hidden bg-surface-recess"
  data-slot="shell"
>
  <div
    class="flex w-c-sidebar-w flex-none border-e border-e-border-hairline bg-(--sidebar)"
    style="--sidebar-width: var(--spacing-c-sidebar-w)"
  >
    <Sidebar narrow={false} />
  </div>
  <div class="flex min-w-0 flex-1 flex-col">
    <ProjectDock docked={false} preview={false}>
      {#snippet page()}
        <!-- The head's place mark is the band's: its press is taken here. -->
        <div
          class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-slot="project-page"
          onclickcapture={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("[data-place-line]")
            ) {
              event.stopPropagation();
              event.preventDefault();
              standing = !standing;
            }
          }}
        >
          <ProjectHead
            {lead}
            {machine}
            onask={none}
            onfilter={none}
            onnewtask={none}
            {project}
            seated
            setup={null}
          />
          {#if standing}
            <DetailsBand
              {accounts}
              {decides}
              {machines}
              {move}
              onclose={() => {
                standing = false;
              }}
              {project}
              {standings}
              {tracker}
            />
          {/if}
          <div
            class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
          >
            <ViewTabs
              current="board"
              hrefOf={(view) => `?view=${view}`}
              onchoose={none}
              {views}
            />
          </div>
          <div
            class="flex min-h-0 flex-auto flex-col overflow-hidden pe-space-6 ps-space-7 max-desk:px-space-5"
          >
            <TaskBoard
              allowedFrom={() => new Set(names)}
              hrefOf={(id) => `?task=${id}`}
              newIn={stages[0]?.name}
              oncreate={async () => ""}
              onmove={none}
              onopen={none}
              {stages}
              {tasks}
            />
          </div>
        </div>
      {/snippet}
      {#snippet dock()}{/snippet}
    </ProjectDock>
  </div>
</div>
