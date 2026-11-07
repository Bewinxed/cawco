<script lang="ts">
  /**
   * Who decides as it is reached: Configure's section (the fleet's table)
   * and a project's Who decides (the fleet's, with the kinds the project
   * handed over itself), read from the hub and drawn by WhoDecidesPage. A
   * hand-over writes the project's decides.md, or the fleet's table.
   */
  import { configureWords } from "@cawco/core/words/configure";
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import { listTasks, type TaskSummary } from "#lib/cawco/project-tasks.js";
  import { WhoDecides } from "./decides.svelte";
  import WhoDecidesPage from "./WhoDecidesPage.svelte";

  let { projectId }: { projectId: string | null } = $props();

  const section = sectionOf("decides");

  const who = new WhoDecides(untrack(() => projectId));
  $effect(() => {
    untrack(() => who.load());
  });

  /** The project's tasks, for Caw's status in his card. */
  let tasks = $state<TaskSummary[]>([]);
  // Caw's switch, harness and model in his card are the project's (CawLead).
  if (untrack(() => projectId) !== null) {
    who.lead = new CawLead({
      id: () => projectId ?? "",
      project: () => project ?? null,
      machinesOnline: () => cawco.onlineMachines.length > 0,
      tasks: () => tasks,
      reading: () => false,
    });
    $effect(() => {
      const id = projectId;
      if (id !== null) {
        listTasks(id)
          .then(({ tasks: listed }) => {
            tasks = listed;
          })
          .catch(() => {
            // His status reads without them: due work isn't counted.
          });
      }
    });
  }

  const project = $derived(
    projectId === null
      ? undefined
      : cawco.projects.find((one) => one.id === projectId)
  );
  /** The project's name as the page says it; empty until the hub's list has it. */
  const name = $derived(project?.name ?? "");
  const ready = $derived(
    who.read.state === "read" && (projectId === null || project !== undefined)
  );
  /** Why a member can't be reached now, in the attention ink's words; null when it can. */
  const facts = (id: string): string | null => {
    const member = who.member(id);
    const said = member ? who.facts(member, project) : null;
    return said?.attention ? said.text : null;
  };
  /** Projects' names by their ids. */
  const named = (ids: string[]) =>
    ids.map((id) => cawco.projects.find((one) => one.id === id)?.name ?? id);
</script>

<svelte:head>
  {#if projectId === null}
    <title>{configureWords.documentTitle(section.label)}</title>
  {:else if project}
    <title>{decidesWords.title(name)} · CawCo</title>
  {/if}
</svelte:head>

{#if projectId === null}
  <!-- Configure's section, its cards straight on the recessed ground: the
       section template's raised body would hold them card in card. No head
       of its own: the rail, or the phone's bar, names the section. -->
  <div
    class="flex min-h-0 min-w-0 flex-auto flex-col overflow-y-auto bg-surface-recess px-space-5 py-space-6"
  >
    <WhoDecidesPage {facts} {named} project={null} {ready} {who} />
  </div>
{:else}
  <div
    class="min-w-0 flex-auto overflow-y-auto pt-space-5 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 max-phone:py-space-4"
  >
    <WhoDecidesPage {facts} {named} project={name || null} {ready} {who} />
  </div>
{/if}
