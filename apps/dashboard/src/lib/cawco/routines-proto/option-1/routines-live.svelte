<script lang="ts">
  /**
   * Fixture for Routines.stories.ts: Harbor's project page on Routines, in
   * the app's shell (shell-frame: the Shell's rail and top bar round the
   * page; the project's head, Caw's seat, and the view strip with Routines
   * chosen), Option 1's view under them. What a press changes stands here
   * as the hub would hold it: which routine is open beside the view, which
   * earlier run's result stands open, and the choices and acts the hub has
   * taken. Harbor's row is in the projects store, written by the story.
   */
  import { CawLead } from "../../project/caw-lead.svelte";
  import ProjectHead from "../../project/ProjectHead.svelte";
  import { projectsStore } from "../../stores/projects.svelte";
  import { ACTIONS, ONE_SCREEN, SOURCES } from "./harbor";
  import RoutinesStrip from "./RoutinesStrip.svelte";
  import RoutinesView from "./RoutinesView.svelte";
  import ShellFrame from "./shell-frame.svelte";

  let {
    opened = null,
    run = null,
  }: {
    /** The routine the page opens with beside the view. */
    opened?: string | null;
    /** The earlier run whose result stands open as it opens. */
    run?: string | null;
  } = $props();

  const PROJECT = "harbor";

  // What the person opened: the story's arg until a press changes it.
  let openId = $derived(opened);
  let runId = $derived(run);
  /** The failed outside actions the person has looked at. */
  let looked = $state<string[]>([]);

  const project = $derived(projectsStore.project(PROJECT));
  // Caw's seat in the head, on Harbor's row: a machine online, no tasks.
  const lead = new CawLead({
    tasks: () => [],
    reading: () => false,
    project: () => project,
    machinesOnline: () => true,
    id: () => PROJECT,
  });
  const none = () => undefined;

  const VIEWS = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 1 },
  ];
</script>

<ShellFrame crumb={project?.name ?? "Project"}>
  <div
    data-slot="project-page"
    class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
  >
    {#if project}
      <ProjectHead
        {lead}
        machine={null}
        onask={none}
        onfilter={none}
        onnewtask={null}
        {project}
        seated
        setup={null}
      />
    {/if}
    <RoutinesStrip onbyhand={none} onchoose={none} onnew={none} views={VIEWS} />
    <RoutinesView
      actions={ACTIONS.filter((one) => !looked.includes(one.id))}
      onact={none}
      onchoose={none}
      ondecide={none}
      onlooked={(id) => {
        looked = [...looked, id];
      }}
      onopen={(id) => {
        openId = id;
        runId = null;
      }}
      onrun={(id) => {
        runId = id;
      }}
      {openId}
      routines={ONE_SCREEN}
      {runId}
      sources={SOURCES}
    />
  </div>
</ShellFrame>
