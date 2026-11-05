<script lang="ts">
  /**
   * A bench's project head (dev only): the project's own head as its page
   * draws it (ProjectHead, seated: Caw's seat and its capsule at its
   * trailing edge), its actions the bench's no-ops; his seat opens his
   * panel. `benchLead` is the Caw it seats: the
   * project's lead as the page makes it, on the bench's own records.
   */
  import { cawco } from "#lib/cawco/client.svelte.js";
  import type { CawLead } from "./caw-lead.svelte";
  import ProjectHead from "./ProjectHead.svelte";

  let { lead, projectId }: { lead: CawLead; projectId: string } = $props();

  const project = $derived(cawco.project(projectId));
  const none = () => undefined;
</script>

{#if project}
  <ProjectHead
    {lead}
    machine={null}
    onaskview={null}
    onfilter={none}
    onnewtask={none}
    {project}
    seated
    setup={null}
  />
{/if}
