<script lang="ts" module>
  import {
    HUB_AWAY,
    MANY_PLACES,
    MISSING_FOLDER,
    NOT_CODE,
    OFFLINE_MACHINE,
    type PassportReading,
    READING,
    RESTING,
    RULE_FILE_UNREADABLE,
    SIGNED_OUT,
    SYNC_REFUSED,
  } from "./records";

  /** What the hub says of the project, by the words a dial names it with. */
  export const SITUATIONS = {
    "All in order": RESTING,
    "A folder is missing": MISSING_FOLDER,
    "Signed out everywhere": SIGNED_OUT,
    "Rule file unreadable": RULE_FILE_UNREADABLE,
    "The tracker refused": SYNC_REFUSED,
    "Still reading": READING,
    "Hub out of reach": HUB_AWAY,
    "A machine is away": OFFLINE_MACHINE,
    "Six places": MANY_PLACES,
    "Not a code project": NOT_CODE,
  } satisfies Record<string, PassportReading>;

  export type Situation = keyof typeof SITUATIONS;
</script>

<script lang="ts">
  /**
   * Option 3 live: Hyucksfield's page in the app's shell, its board live,
   * Option 3's bar over it with the Passport hung from Details. The mock hub
   * holds what a press changes: whether the Passport stands open, and the
   * tracker's sync after Sync now (syncing, then in step a moment later).
   */
  import type { TrackerSyncState } from "@cawco/core/trackers";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { RESTING_LEAD } from "#lib/cawco/project/caw-lead.fixture.js";
  import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import { PROJECT_ID, STAGES, TASKS } from "./board-fixture";
  import ProjectBar from "./ProjectBar.svelte";
  import { type PassportActs, withSync } from "./records";
  import ShellFrame from "./shell-frame.svelte";

  let {
    situation = "All in order",
    opened = true,
  }: {
    /** What the hub says of the project. */
    situation?: Situation;
    /** The Passport stands open as the page opens. */
    opened?: boolean;
  } = $props();

  const VIEWS: BarView[] = [
    { count: 0, draft: false, label: "Board", value: "board" },
    { count: 0, draft: false, label: "Table", value: "table" },
    { count: 2, draft: false, label: "Decisions", value: "decisions" },
    { count: 0, draft: false, label: "Calendar", value: "calendar" },
  ];

  /** The mock hub's: the sync it is running or ran since the page opened. */
  let sync = $state<TrackerSyncState | null>(null);
  let open = $derived(opened);
  let narrow = $state(false);
  let view = $state("board");
  let needsOn = $state(false);

  const reading = $derived.by(() => {
    const said = SITUATIONS[situation];
    return sync === null ? said : withSync(said, sync);
  });
  const needs = TASKS.filter((task) => task.needsYou).length;
  const allowedFrom = () => new Set(STAGES.map((stage) => stage.name));

  /** Every act the Passport sends, answered as the hub would. */
  const acts: PassportActs = {
    addPlace: () => undefined,
    configure: () => undefined,
    copy: () => undefined,
    drop: () => undefined,
    editRules: () => undefined,
    findFolder: () => undefined,
    move: () => undefined,
    retry: () => undefined,
    sync: () => {
      sync = "syncing";
      setTimeout(() => {
        sync = "synced";
      }, 1800);
    },
  };
</script>

<ShellFrame bind:narrow>
  <div class="flex h-full min-h-0 flex-col">
    <ProjectBar
      {acts}
      name={reading.project.name}
      {narrow}
      {reading}
      bind:open={
        () => open,
        (next) => {
          open = next;
        }
      }
    >
      {#snippet seat()}
        <CawSeat
          lead={RESTING_LEAD}
          projectId={PROJECT_ID}
          projectName={reading.project.name}
          size={32}
        />
      {/snippet}
    </ProjectBar>
    <div class="flex min-w-0 flex-none items-center">
      <ViewTabs
        current={view}
        hrefOf={(next) => `/project/${PROJECT_ID}/view/${next}`}
        onchoose={(next) => {
          view = next;
        }}
        views={VIEWS}
      />
    </div>
    <ViewBar
      current={view}
      {needs}
      {needsOn}
      onchoose={(next) => {
        view = next;
      }}
      onnewsession={() => undefined}
      ontoggleneeds={() => {
        needsOn = !needsOn;
      }}
      views={VIEWS}
    />
    <div class="min-h-0 flex-auto">
      <TaskBoard
        {allowedFrom}
        hrefOf={(id) => `/project/${PROJECT_ID}/task/${id}`}
        newIn="Backlog"
        oncreate={async () => "tsk-121"}
        onmove={() => undefined}
        onopen={() => undefined}
        stages={STAGES}
        tasks={needsOn ? TASKS.filter((task) => task.needsYou) : TASKS}
      />
    </div>
  </div>
</ShellFrame>
