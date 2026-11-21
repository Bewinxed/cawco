<script lang="ts">
  /**
   * The live story's fixture: Option 2's Routines tab under the project page's
   * head and its view strip as they ship, Routines chosen.
   * Its own state is what the stand-in hub would hold: what stands open
   * beside the view, where each routine stands after a choice, and which
   * failed outside actions were looked at.
   */
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore, IconPen, IconPlus, IconSparkles } from "#lib/icons.js";
  import { type Routine, type Run, type Source, STANDINGS } from "./day";
  import type { Standing } from "./RoutineRow.svelte";
  import RoutinesScreen from "./RoutinesScreen.svelte";
  import StandLine from "./StandLine.svelte";

  let {
    project,
    routines,
    runs,
    sources,
    now,
    live = true,
  }: {
    project: ProjectRow;
    routines: Routine[];
    runs: Run[];
    sources: Source[];
    now: number;
    live?: boolean;
  } = $props();

  /** Caw's seat in the head, his project Harbor, nothing in it moving. */
  const lead = new CawLead({
    id: () => project.id,
    machinesOnline: () => true,
    project: () => project,
    reading: () => false,
    tasks: () => [],
  });

  let open = $state<{ kind: "run" | "routine"; id: string } | null>(null);
  let standings = $state<Record<string, Standing>>({ ...STANDINGS });
  let looked = $state<string[]>([]);

  const VIEWS = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 0 },
  ];

  /** What a choice moves the routine to, as the hub would answer it. */
  const MOVES: Record<string, Standing> = {
    Keep: "next",
    "Turn off": "wontRun",
    "Run again": "running",
    "Look again now": "running",
    "Say it is met": "wontRun",
    Pause: "wontRun",
    "Turn on": "next",
  };

  function choose(id: string, choice: string): void {
    if (choice === "Decide") {
      const asked = runs.find((run) =>
        run.actions?.some((action) => action.stands === "waiting")
      );
      if (asked) {
        open = { kind: "run", id: asked.id };
      }
      return;
    }
    const to = MOVES[choice];
    if (to) {
      standings = { ...standings, [id]: to };
    }
  }
</script>

<div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-recess">
  <ProjectHead
    {lead}
    machine={null}
    onask={() => undefined}
    onfilter={() => undefined}
    onnewtask={() => undefined}
    {project}
    seated
    setup={null}
  />
  <div
    class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
  >
    <ViewTabs
      current="routines"
      hrefOf={(view) => `?view=${view}`}
      onchoose={() => undefined}
      views={VIEWS}
    />
    <span
      aria-hidden="true"
      class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
    ></span>
    <div data-form="compact" class="flex flex-none items-center gap-space-2">
      <Button
        aria-label="New routine"
        layout="wide"
        press="pressable"
        size="sm"
        title="New routine"
        variant="ghost"
      >
        <IconPlus />
        <span class="in-form-compact:hidden">New routine</span>
      </Button>
      <Button
        aria-label="Ask Caw"
        layout="wide"
        press="pressable"
        size="sm"
        title="Ask Caw"
        variant="ghost"
      >
        <IconSparkles />
        <span class="in-form-compact:hidden">Ask Caw</span>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="More for Routines"
          class="touch-hit"
          size="icon-sm"
          variant="ghost"
        >
          <IconMore />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-auto">
          <DropdownMenu.Item>
            <IconPen />
            <span>Set up by hand</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <div class="ms-auto min-w-0">
      <StandLine {live} {now} {routines} {runs} {standings} />
    </div>
  </div>
  <RoutinesScreen
    {looked}
    {now}
    onchangewithcaw={() => undefined}
    onchoose={choose}
    onedit={() => undefined}
    onlooked={(id) => {
      looked = [...looked, id];
    }}
    onopen={(what) => {
      open = what;
    }}
    onopensession={() => undefined}
    {open}
    {routines}
    {runs}
    {sources}
    {standings}
  />
</div>
