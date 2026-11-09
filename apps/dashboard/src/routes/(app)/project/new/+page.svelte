<script lang="ts">
  /**
   * New project (design §5, PRD §5.6): the page is NewProject, handed where
   * the fleet stands (home-state `machines`, `reading` until the hub has
   * listed them) and the hub's create. The send lands on the project's page
   * with Caw's panel open on the conversation setting it up, the words its
   * first message: the board and the conversation in sight together.
   */
  import { barGlass } from "#lib/cawco/bar-glass.svelte.js";
  import { connect } from "#lib/cawco/connect/installs.svelte.js";
  import { home } from "#lib/cawco/home/home-state.svelte.js";
  import { openOnArrival } from "#lib/cawco/project/caw-lead.svelte.js";
  import NewProject from "#lib/cawco/project/NewProject.svelte";
  import { createProject } from "#lib/cawco/stores/projects.svelte.js";
  import { goto } from "$app/navigation";
</script>

<svelte:head>
  <title>New project &middot; CawCo</title>
</svelte:head>

<NewProject
  create={createProject}
  fleet={home.machines ?? "reading"}
  onmachines={(anchor, fleet) => {
    if (fleet === "none") {
      connect.openNew(anchor, "ssh");
    } else {
      barGlass.open = "machines";
    }
  }}
  onmade={(id) => {
    openOnArrival(id);
    return goto(`/project/${encodeURIComponent(id)}`);
  }}
/>
